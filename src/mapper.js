// Turns raw TikTok web API items into flat, analysis-ready records.
// Field names match the popular TikTok scraper output (id, title, views, likes,
// channel.*, video.*, song.* ...) so existing pipelines keep working, plus a
// `metrics` block with derived engagement numbers.

const num = (...values) => {
    for (const v of values) {
        if (v === undefined || v === null || v === '') continue;
        const n = Number(v);
        if (Number.isFinite(n)) return n;
    }
    return 0;
};

const round = (value, digits = 2) => {
    if (!Number.isFinite(value)) return null;
    const f = 10 ** digits;
    return Math.round(value * f) / f;
};

const ORIGINAL_SOUND_RE = /(original sound|oryginalny d[źz]wi[ęe]k|d[źz]wi[ęe]k oryginalny|son original|sonido original|originalton|suono originale)/i;

/**
 * Pulls every video item out of any TikTok web API response shape we know:
 * search item/full (item_list), search general/full (data[].item),
 * challenge / post / music feeds (itemList) and SSR rehydration blobs.
 */
export function extractItems(payload) {
    if (!payload || typeof payload !== 'object') return [];
    const found = [];
    const pushIfVideo = (it) => {
        if (it && typeof it === 'object' && it.id && (it.stats || it.statsV2 || it.video)) found.push(it);
    };
    for (const key of ['item_list', 'itemList', 'items']) {
        if (Array.isArray(payload[key])) payload[key].forEach(pushIfVideo);
    }
    if (Array.isArray(payload.data)) {
        for (const entry of payload.data) {
            if (entry?.item) pushIfVideo(entry.item);
            else if (entry?.type === undefined) pushIfVideo(entry);
        }
    }
    // SSR: __UNIVERSAL_DATA_FOR_REHYDRATION__ → __DEFAULT_SCOPE__['webapp.video-detail'].itemInfo.itemStruct
    const scope = payload.__DEFAULT_SCOPE__;
    if (scope && typeof scope === 'object') {
        for (const section of Object.values(scope)) {
            if (section?.itemInfo?.itemStruct) pushIfVideo(section.itemInfo.itemStruct);
            if (Array.isArray(section?.itemList)) section.itemList.forEach(pushIfVideo);
        }
    }
    return found;
}

export function hasMore(payload) {
    if (!payload || typeof payload !== 'object') return false;
    return Boolean(payload.has_more ?? payload.hasMore ?? false);
}

function hashtagsOf(raw) {
    const tags = new Set();
    for (const t of raw.textExtra ?? []) if (t?.hashtagName) tags.add(String(t.hashtagName).toLowerCase());
    for (const c of raw.challenges ?? []) if (c?.title) tags.add(String(c.title).toLowerCase());
    if (tags.size === 0 && raw.desc) {
        for (const m of String(raw.desc).matchAll(/#([\p{L}\p{N}_]+)/gu)) tags.add(m[1].toLowerCase());
    }
    return [...tags];
}

/** First sentence / line of the caption without hashtags — the "hook". */
export function hookOf(caption) {
    if (!caption) return '';
    const clean = String(caption).replace(/#[\p{L}\p{N}_]+/gu, '').replace(/\s+/g, ' ').trim();
    if (!clean) return '';
    const firstLine = String(caption).split('\n')[0].replace(/#[\p{L}\p{N}_]+/gu, '').trim();
    const base = firstLine || clean;
    const sentence = base.split(/(?<=[.!?…])\s/u)[0].trim();
    return sentence.length > 140 ? `${sentence.slice(0, 137)}...` : sentence;
}

function partsInTimezone(date, timezone) {
    try {
        const fmt = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone, hour: 'numeric', hourCycle: 'h23', weekday: 'short',
        });
        const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
        const weekdays = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
        return { hour: Number(parts.hour), weekday: weekdays[parts.weekday] ?? null };
    } catch {
        return { hour: date.getUTCHours(), weekday: ((date.getUTCDay() + 6) % 7) + 1 };
    }
}

export function computeMetrics(rec, { timezone = 'UTC', now = Date.now() } = {}) {
    const { views, likes, comments, shares, bookmarks } = rec;
    const interactions = likes + comments + shares + bookmarks;
    const uploaded = rec.uploadedAt ? new Date(rec.uploadedAt * 1000) : null;
    const ageDays = uploaded ? Math.max((now - uploaded.getTime()) / 86_400_000, 1 / 24) : null;
    const tz = uploaded ? partsInTimezone(uploaded, timezone) : { hour: null, weekday: null };
    const followers = rec.channel?.followers ?? 0;
    return {
        engagementRate: views ? round((interactions / views) * 100) : null,
        likeRate: views ? round((likes / views) * 100) : null,
        shareRate: views ? round((shares / views) * 100, 3) : null,
        saveRate: views ? round((bookmarks / views) * 100, 3) : null,
        commentRate: views ? round((comments / views) * 100, 3) : null,
        viralRatio: followers ? round(views / followers) : null,
        viewsPerDay: ageDays ? Math.round(views / ageDays) : null,
        ageDays: ageDays === null ? null : round(ageDays, 1),
        postedHour: tz.hour,
        postedWeekday: tz.weekday,
        hashtagCount: rec.hashtags.length,
        captionLength: rec.title.length,
        hasOriginalSound: Boolean(rec.song?.original || ORIGINAL_SOUND_RE.test(rec.song?.title ?? '')),
        hook: hookOf(rec.title),
    };
}

/**
 * @param raw TikTok itemStruct
 * @param ctx { keyword, inputSource, timezone, now }
 */
export function mapItem(raw, ctx = {}) {
    const stats = raw.stats ?? {};
    const statsV2 = raw.statsV2 ?? {};
    const author = raw.author ?? {};
    const authorStats = raw.authorStats ?? raw.authorStatsV2 ?? {};
    const video = raw.video ?? {};
    const music = raw.music ?? {};
    const username = author.uniqueId ?? '';
    const createTime = num(raw.createTime) || null;
    const subtitles = (video.subtitleInfos ?? []).map((s) => ({
        lang: s.LanguageCodeName ?? s.languageCodeName ?? null,
        language_code: s.LanguageID ?? s.languageId ?? null,
        url: s.Url ?? s.url ?? null,
        format: s.Format ?? s.format ?? null,
        source: s.Source ?? s.source ?? null,
    })).filter((s) => s.url);

    const rec = {
        id: String(raw.id),
        title: raw.desc ?? '',
        views: num(stats.playCount, statsV2.playCount),
        likes: num(stats.diggCount, statsV2.diggCount),
        comments: num(stats.commentCount, statsV2.commentCount),
        shares: num(stats.shareCount, statsV2.shareCount),
        bookmarks: num(stats.collectCount, statsV2.collectCount),
        hashtags: hashtagsOf(raw),
        uploadedAt: createTime,
        uploadedAtFormatted: createTime ? new Date(createTime * 1000).toISOString() : null,
        postPage: username ? `https://www.tiktok.com/@${username}/video/${raw.id}` : `https://www.tiktok.com/video/${raw.id}`,
        isAd: Boolean(raw.isAd),
        language: raw.textLanguage ?? null,
        channel: {
            id: author.id ?? null,
            name: author.nickname ?? null,
            username,
            url: username ? `https://www.tiktok.com/@${username}` : null,
            avatar: author.avatarThumb ?? author.avatarMedium ?? null,
            verified: Boolean(author.verified),
            followers: num(authorStats.followerCount),
            following: num(authorStats.followingCount),
            videos: num(authorStats.videoCount),
            likes: num(authorStats.heartCount, authorStats.heart),
            bio: author.signature ?? null,
        },
        video: {
            width: num(video.width) || null,
            height: num(video.height) || null,
            ratio: video.ratio ?? null,
            duration: num(video.duration),
            url: video.playAddr ?? video.downloadAddr ?? null,
            cover: video.cover ?? video.originCover ?? null,
            thumbnail: video.dynamicCover ?? video.cover ?? null,
        },
        song: {
            id: music.id ?? null,
            title: music.title ?? null,
            artist: music.authorName ?? null,
            album: music.album ?? null,
            duration: num(music.duration) || null,
            cover: music.coverThumb ?? music.coverMedium ?? null,
            original: Boolean(music.original),
        },
        poi: raw.poi ? {
            name: raw.poi.name ?? null,
            address: raw.poi.address ?? null,
            city: raw.poi.city ?? null,
        } : null,
        subtitles,
        keyword: ctx.keyword ?? null,
        inputSource: ctx.inputSource ?? null,
        scrapedAt: new Date(ctx.now ?? Date.now()).toISOString(),
    };
    rec.metrics = computeMetrics(rec, ctx);
    return rec;
}
