// Aggregates mapped records into insights for content creators.

export const median = (values) => {
    const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
    if (!v.length) return null;
    const mid = Math.floor(v.length / 2);
    return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};

const round = (x, d = 2) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

function groupStats(records) {
    return {
        count: records.length,
        medianViews: median(records.map((r) => r.views)),
        medianEngagement: round(median(records.map((r) => r.metrics.engagementRate))),
        medianShareRate: round(median(records.map((r) => r.metrics.shareRate)), 3),
        medianSaveRate: round(median(records.map((r) => r.metrics.saveRate)), 3),
    };
}

function bucketize(records, bucketsDef, valueOf) {
    return bucketsDef.map(({ label, min, max }) => {
        const inBucket = records.filter((r) => {
            const v = valueOf(r);
            return Number.isFinite(v) && v >= min && v <= max;
        });
        return { label, ...groupStats(inBucket) };
    });
}

const DURATION_BUCKETS = [
    { label: '0-10 s', min: 1, max: 10 },
    { label: '11-20 s', min: 11, max: 20 },
    { label: '21-30 s', min: 21, max: 30 },
    { label: '31-60 s', min: 31, max: 60 },
    { label: '60+ s', min: 61, max: Infinity },
];

const HASHTAG_COUNT_BUCKETS = [
    { label: '0-2', min: 0, max: 2 },
    { label: '3-5', min: 3, max: 5 },
    { label: '6-9', min: 6, max: 9 },
    { label: '10+', min: 10, max: Infinity },
];

const best = (rows, minCount) => rows
    .filter((r) => r.count >= minCount && r.medianViews !== null)
    .sort((a, b) => b.medianViews - a.medianViews)[0] ?? null;

export function analyze(records, { language = 'pl' } = {}) {
    const n = records.length;
    const minGroup = n >= 100 ? 5 : n >= 30 ? 3 : 1;

    // Hashtags
    const tagMap = new Map();
    for (const r of records) for (const t of r.hashtags) {
        if (!tagMap.has(t)) tagMap.set(t, []);
        tagMap.get(t).push(r);
    }
    const hashtags = [...tagMap.entries()]
        .map(([tag, recs]) => ({ tag, ...groupStats(recs) }))
        .filter((h) => h.count >= Math.max(2, minGroup) || n < 20)
        .sort((a, b) => (b.medianViews ?? 0) - (a.medianViews ?? 0));
    const mostUsedHashtags = [...tagMap.entries()]
        .map(([tag, recs]) => ({ tag, count: recs.length }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);

    // Posting time
    const byHour = Array.from({ length: 24 }, (_, hour) => ({
        hour, ...groupStats(records.filter((r) => r.metrics.postedHour === hour)),
    }));
    const byWeekday = Array.from({ length: 7 }, (_, i) => ({
        weekday: i + 1, ...groupStats(records.filter((r) => r.metrics.postedWeekday === i + 1)),
    }));

    // Format
    const duration = bucketize(records, DURATION_BUCKETS, (r) => r.video.duration);
    const hashtagCount = bucketize(records, HASHTAG_COUNT_BUCKETS, (r) => r.metrics.hashtagCount);
    const sound = {
        original: groupStats(records.filter((r) => r.metrics.hasOriginalSound)),
        music: groupStats(records.filter((r) => !r.metrics.hasOriginalSound)),
    };

    // Creators
    const creatorMap = new Map();
    for (const r of records) {
        const key = r.channel.username || r.channel.id;
        if (!key) continue;
        if (!creatorMap.has(key)) creatorMap.set(key, { username: r.channel.username, name: r.channel.name, url: r.channel.url, followers: r.channel.followers, verified: r.channel.verified, videos: [] });
        creatorMap.get(key).videos.push(r);
    }
    const creators = [...creatorMap.values()].map((c) => ({
        username: c.username,
        name: c.name,
        url: c.url,
        followers: c.followers,
        verified: c.verified,
        videosFound: c.videos.length,
        totalViews: c.videos.reduce((s, v) => s + v.views, 0),
        medianViralRatio: round(median(c.videos.map((v) => v.metrics.viralRatio))),
    })).sort((a, b) => b.totalViews - a.totalViews);

    const smallCreatorVirals = records
        .filter((r) => r.channel.followers > 0 && r.channel.followers <= 20_000 && (r.metrics.viralRatio ?? 0) >= 10)
        .sort((a, b) => b.metrics.viralRatio - a.metrics.viralRatio)
        .slice(0, 15)
        .map(slim);

    const topByViews = [...records].sort((a, b) => b.views - a.views).slice(0, 15).map(slim);
    const topByShares = [...records].sort((a, b) => b.shares - a.shares).slice(0, 10).map(slim);
    const topBySaves = [...records].sort((a, b) => b.bookmarks - a.bookmarks).slice(0, 10).map(slim);
    const topHooks = [...records]
        .filter((r) => r.metrics.hook && r.views >= (median(records.map((x) => x.views)) ?? 0))
        .sort((a, b) => (b.metrics.engagementRate ?? 0) - (a.metrics.engagementRate ?? 0))
        .slice(0, 15)
        .map((r) => ({ hook: r.metrics.hook, views: r.views, engagementRate: r.metrics.engagementRate, url: r.postPage }));

    const summary = {
        generatedAt: new Date().toISOString(),
        totals: {
            videos: n,
            creators: creatorMap.size,
            keywords: [...new Set(records.map((r) => r.keyword).filter(Boolean))],
            ...groupStats(records),
            medianViralRatio: round(median(records.map((r) => r.metrics.viralRatio))),
        },
        best: {
            hour: best(byHour, minGroup),
            weekday: best(byWeekday, minGroup),
            duration: best(duration, minGroup),
            hashtagCount: best(hashtagCount, minGroup),
        },
        hashtags: hashtags.slice(0, 25),
        mostUsedHashtags,
        byHour,
        byWeekday,
        duration,
        hashtagCount,
        sound,
        creators: creators.slice(0, 25),
        smallCreatorVirals,
        topByViews,
        topByShares,
        topBySaves,
        topHooks,
    };
    summary.recommendations = recommendations(summary, language);
    summary.sampleWarning = n < 50;
    return summary;
}

function slim(r) {
    return {
        id: r.id,
        url: r.postPage,
        cover: r.video.cover,
        caption: r.title.length > 160 ? `${r.title.slice(0, 157)}...` : r.title,
        views: r.views,
        likes: r.likes,
        shares: r.shares,
        bookmarks: r.bookmarks,
        engagementRate: r.metrics.engagementRate,
        viralRatio: r.metrics.viralRatio,
        duration: r.video.duration,
        creator: r.channel.username,
        followers: r.channel.followers,
        uploadedAt: r.uploadedAtFormatted,
    };
}

const WEEKDAYS = {
    pl: ['poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela'],
    en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
};

export const weekdayName = (i, lang = 'pl') => (WEEKDAYS[lang] ?? WEEKDAYS.en)[i - 1];

function ratio(a, b) {
    if (!a || !b) return null;
    return a / b;
}

export function filmsPl(n) {
    const lastTwo = n % 100;
    const last = n % 10;
    if (n === 1) return '1 film';
    if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${n} filmy`;
    return `${n} filmów`;
}

function recommendations(s, lang) {
    const pl = lang === 'pl';
    const out = [];
    const fmt = (x) => Math.round(x).toLocaleString(pl ? 'pl-PL' : 'en-US');
    const dec = (x) => x.toLocaleString(pl ? 'pl-PL' : 'en-US', { maximumFractionDigits: 2 });
    const vids = (n) => (pl ? filmsPl(n) : `${n} video${n === 1 ? '' : 's'}`);

    const o = s.sound.original;
    const m = s.sound.music;
    if (o.count >= 3 && m.count >= 3) {
        const r = ratio(o.medianViews, m.medianViews);
        if (r && r >= 1.3) out.push(pl
            ? `Filmy z własnym dźwiękiem (najczęściej lektor) mają ${dec(r)}× wyższą medianę wyświetleń niż te z muzyką. Nagrywaj cytaty głosem.`
            : `Videos with original sound (usually voice-over) get ${dec(r)}× the median views of music-only ones. Record quotes with your voice.`);
        else if (r && r <= 0.77) out.push(pl
            ? `Filmy z muzyką mają ${dec(1 / r)}× wyższą medianę wyświetleń niż z własnym dźwiękiem. Postaw na popularne dźwięki.`
            : `Music-backed videos get ${dec(1 / r)}× the median views of original-sound ones. Use trending sounds.`);
    }
    if (s.best.duration) out.push(pl
        ? `Najlepsza długość: ${s.best.duration.label} (mediana ${fmt(s.best.duration.medianViews)} wyświetleń, ${vids(s.best.duration.count)}).`
        : `Best length: ${s.best.duration.label} (median ${fmt(s.best.duration.medianViews)} views, ${vids(s.best.duration.count)}).`);
    if (s.best.hashtagCount) out.push(pl
        ? `Najlepiej działa ${s.best.hashtagCount.label} hashtagów na film.`
        : `${s.best.hashtagCount.label} hashtags per video perform best.`);
    if (s.best.hour) out.push(pl
        ? `Najmocniejsza godzina publikacji: ${s.best.hour.hour}:00 (mediana ${fmt(s.best.hour.medianViews)} wyświetleń, ${vids(s.best.hour.count)}).`
        : `Strongest posting hour: ${s.best.hour.hour}:00 (median ${fmt(s.best.hour.medianViews)} views, ${vids(s.best.hour.count)}).`);
    if (s.best.weekday) out.push(pl
        ? `Najlepszy dzień: ${weekdayName(s.best.weekday.weekday, 'pl')}.`
        : `Best day: ${weekdayName(s.best.weekday.weekday, 'en')}.`);
    const topTags = s.hashtags.filter((h) => h.count >= 2).slice(0, 5).map((h) => `#${h.tag}`);
    if (topTags.length) out.push(pl
        ? `Hashtagi z najwyższą medianą wyświetleń: ${topTags.join(', ')}.`
        : `Hashtags with the highest median views: ${topTags.join(', ')}.`);
    if (s.smallCreatorVirals.length) out.push(pl
        ? `${vids(s.smallCreatorVirals.length)} małych kont (do 20 tys. obserwujących) ma co najmniej 10× więcej wyświetleń niż obserwujących. Zasięg w tej niszy nie zależy od wielkości konta.`
        : `${vids(s.smallCreatorVirals.length)} from small accounts (≤20k followers) got 10×+ more views than followers. Reach in this niche doesn't depend on account size.`);
    const share = s.totals.medianShareRate;
    const save = s.totals.medianSaveRate;
    if (share && save) out.push(pl
        ? `Mediana udostępnień: ${dec(share)}% wyświetleń, zapisów: ${dec(save)}%. Filmy powyżej tych progów algorytm zwykle wypycha dalej.`
        : `Median share rate: ${share}% of views, save rate: ${save}%. Videos above these thresholds usually get pushed further.`);
    return out;
}
