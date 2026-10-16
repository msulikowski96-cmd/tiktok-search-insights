import { Actor, log } from 'apify';
import { PlaywrightCrawler } from 'crawlee';
import { extractItems, mapItem } from './mapper.js';
import { analyze } from './analytics.js';
import { renderReport } from './report.js';

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const {
    keywords = [],
    hashtags = [],
    maxItems = 200,
    maxItemsPerQuery = 100,
    sortBy = 'RELEVANCE',
    minViews,
    maxAgeDays,
    maxFollowers,
    uniqueAuthors = false,
    generateReport = true,
    timezone = 'Europe/Warsaw',
    reportLanguage = 'pl',
    proxyConfiguration: proxyInput = { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
    sessionCookie,
    maxScrolls = 40,
} = input;

const cleanList = (list) => [...new Set((list ?? []).map((s) => String(s).trim()).filter(Boolean))];
const keywordList = cleanList(keywords);
const hashtagList = cleanList(hashtags).map((h) => h.replace(/^#/, '').replace(/\s+/g, ''));

if (!keywordList.length && !hashtagList.length) {
    await Actor.fail('Provide at least one keyword or hashtag.');
}

const proxyConfiguration = await Actor.createProxyConfiguration(proxyInput);

// Run-global state. Persisted so an Apify migration does not duplicate output.
const state = (await Actor.useState('STATE', { seenIds: [], seenAuthors: [], count: 0 }));
const seenIds = new Set(state.seenIds);
const seenAuthors = new Set(state.seenAuthors);
const collected = [];
const nowMs = Date.now();
const pushImmediately = sortBy === 'RELEVANCE';

Actor.on('persistState', () => {
    state.seenIds = [...seenIds];
    state.seenAuthors = [...seenAuthors];
});

// Captured API responses per page (kept outside userData: it must stay small and serializable).
const pendingByRequest = new Map();
// Every TikTok /api/ call per page, for diagnostics when nothing is found.
const apiLogByRequest = new Map();

const API_RE = /\/api\/(search\/(item|general|video)\/full|challenge\/item_list|post\/item_list|music\/item_list)/;

function passesFilters(rec) {
    if (rec.isAd) return false;
    if (minViews && rec.views < minViews) return false;
    if (maxAgeDays && rec.metrics.ageDays !== null && rec.metrics.ageDays > maxAgeDays) return false;
    if (maxFollowers !== undefined && maxFollowers !== null && rec.channel.followers > maxFollowers) return false;
    if (uniqueAuthors && rec.channel.id && seenAuthors.has(rec.channel.id)) return false;
    return true;
}

const totalReached = () => state.count >= maxItems;

/** Maps, filters, dedupes and stores raw items. Returns how many were accepted. */
async function accept(rawItems, request) {
    let added = 0;
    const { query, source } = request.userData;
    request.userData.found ??= 0;
    for (const raw of rawItems) {
        if (totalReached() || request.userData.found >= maxItemsPerQuery) break;
        const id = String(raw.id);
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        const rec = mapItem(raw, { keyword: query, inputSource: source, timezone, now: nowMs });
        if (!passesFilters(rec)) continue;
        if (rec.channel.id) seenAuthors.add(rec.channel.id);
        state.count += 1;
        request.userData.found += 1;
        added += 1;
        collected.push(rec);
        if (pushImmediately) await Actor.pushData(rec);
    }
    return added;
}

async function dismissPopups(page) {
    await page.keyboard.press('Escape').catch(() => {});
    for (const sel of [
        '[data-e2e="modal-close-inner-button"]',
        'div[role="dialog"] button[aria-label="Close"]',
        'button:has-text("Decline optional cookies")',
        'button:has-text("Odrzuć opcjonalne pliki cookie")',
        'button:has-text("Not now")',
    ]) {
        const el = page.locator(sel).first();
        if (await el.isVisible().catch(() => false)) await el.click({ timeout: 2000 }).catch(() => {});
    }
}

async function isBlocked(page) {
    return page.evaluate(() => Boolean(
        document.querySelector('#captcha-verify-container, #captcha_container, .captcha_verify_container, .captcha-verify-container'),
    )).catch(() => false);
}

async function hasLoginWall(page) {
    return page.evaluate(() => {
        const txt = document.body?.innerText ?? '';
        return /Log in to (TikTok|search|continue)|Zaloguj się/i.test(txt) && !document.querySelector('[data-e2e="search_video-item"], [data-e2e="challenge-item"]');
    }).catch(() => false);
}

/** Stores what the browser saw when a query returned nothing: screenshot, HTML and TikTok API calls. */
async function saveDebug(page, request, flags) {
    try {
        const key = `DEBUG-${request.userData.query.replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 40)}-${request.retryCount}`
            .normalize('NFD').replace(/[^\x00-\x7F]/g, '');
        const info = {
            query: request.userData.query,
            requestedUrl: request.url,
            finalUrl: page.url(),
            title: await page.title().catch(() => null),
            ...flags,
            bodyText: (await page.evaluate(() => document.body?.innerText ?? '').catch(() => '')).slice(0, 3000),
            apiCalls: apiLogByRequest.get(request.uniqueKey) ?? [],
        };
        await Actor.setValue(`${key}-info`, info);
        const html = await page.content().catch(() => '');
        await Actor.setValue(`${key}-html`, html.slice(0, 500_000), { contentType: 'text/html; charset=utf-8' });
        const png = await page.screenshot({ fullPage: false }).catch(() => null);
        if (png) await Actor.setValue(`${key}-screenshot`, png, { contentType: 'image/png' });
        log.warning(`Debug saved for ${request.userData.query}: ${key}-info / -html / -screenshot in the key-value store. `
            + `Final URL: ${info.finalUrl}, title: ${info.title}, TikTok API calls: ${info.apiCalls.length}, `
            + `captcha: ${flags.blocked}, login wall: ${flags.loginWall}`);
        if (info.apiCalls.length) log.info(`API calls: ${info.apiCalls.slice(0, 25).join(' | ')}`);
    } catch (err) {
        log.warning(`Could not save debug info: ${err.message}`);
    }
}

const startUrls = [
    ...keywordList.map((k) => ({
        url: `https://www.tiktok.com/search/video?q=${encodeURIComponent(k)}`,
        uniqueKey: `kw:${k}`,
        userData: { query: k, source: 'keyword' },
    })),
    ...hashtagList.map((h) => ({
        url: `https://www.tiktok.com/tag/${encodeURIComponent(h)}`,
        uniqueKey: `tag:${h}`,
        userData: { query: `#${h}`, source: 'hashtag' },
    })),
];

const crawler = new PlaywrightCrawler({
    proxyConfiguration,
    maxConcurrency: 2,
    maxRequestRetries: 5,
    navigationTimeoutSecs: 60,
    requestHandlerTimeoutSecs: 600,
    useSessionPool: true,
    persistCookiesPerSession: true,
    sessionPoolOptions: { maxPoolSize: 20, sessionOptions: { maxUsageCount: 5 } },
    launchContext: {
        useChrome: true,
        launchOptions: { headless: true, args: ['--disable-blink-features=AutomationControlled'] },
    },
    browserPoolOptions: {
        useFingerprints: true,
        fingerprintOptions: {
            fingerprintGeneratorOptions: { browsers: ['chrome'], operatingSystems: ['windows', 'macos'], devices: ['desktop'] },
        },
    },
    preNavigationHooks: [
        async ({ page, request }, gotoOptions) => {
            gotoOptions.waitUntil = 'domcontentloaded';
            const pending = [];
            const apiLog = [];
            pendingByRequest.set(request.uniqueKey, pending);
            apiLogByRequest.set(request.uniqueKey, apiLog);
            if (sessionCookie) {
                await page.context().addCookies([{
                    name: 'sessionid', value: sessionCookie, domain: '.tiktok.com', path: '/', httpOnly: true, secure: true,
                }]);
            }
            page.on('response', async (response) => {
                const url = response.url();
                if (/tiktok\.com\/api\//.test(url) && apiLog.length < 200) {
                    apiLog.push(`${response.status()} ${url.split('?')[0]}`);
                }
                if (!API_RE.test(url) || response.status() !== 200) return;
                try {
                    const body = await response.json();
                    pending.push(body);
                } catch { /* empty or non-JSON body */ }
            });
            // Images and media are not needed: saves proxy traffic.
            await page.route(/\.(png|jpe?g|webp|gif|mp4|webm|woff2?)(\?|$)/i, (route) => route.abort()).catch(() => {});
        },
    ],
    async requestHandler({ page, request, session }) {
        if (totalReached()) return;
        const label = request.userData.query;
        log.info(`Opening ${label}`);

        const drain = async () => {
            const batch = (pendingByRequest.get(request.uniqueKey) ?? []).splice(0);
            let added = 0;
            for (const body of batch) added += await accept(extractItems(body), request);
            return { added, responses: batch.length };
        };

        // Wait until the first search response arrives (up to ~20 s) instead of a fixed sleep.
        const waitForFirstResponse = async () => {
            for (let t = 0; t < 20; t++) {
                if ((pendingByRequest.get(request.uniqueKey) ?? []).length) return true;
                if (t === 3 || t === 10) await dismissPopups(page);
                await page.waitForTimeout(1000);
            }
            return false;
        };

        const scrollAndCollect = async () => {
            let idle = 0;
            let sawAnyResponse = false;
            for (let i = 0; i < maxScrolls; i++) {
                const { added, responses } = await drain();
                if (responses) sawAnyResponse = true;
                if (totalReached() || request.userData.found >= maxItemsPerQuery) break;
                idle = responses === 0 && added === 0 ? idle + 1 : 0;
                if (idle >= 5) break;
                await page.mouse.wheel(0, 2500 + Math.round(Math.random() * 1500));
                await page.waitForTimeout(1500 + Math.round(Math.random() * 1500));
                if (i % 5 === 4) await dismissPopups(page);
            }
            const last = await drain();
            return sawAnyResponse || last.responses > 0;
        };

        const collectSsr = async () => {
            const ssr = await page.evaluate(() => {
                const el = document.querySelector('#__UNIVERSAL_DATA_FOR_REHYDRATION__, #SIGI_STATE');
                try { return el ? JSON.parse(el.textContent) : null; } catch { return null; }
            }).catch(() => null);
            if (ssr) await accept(extractItems(ssr), request);
        };

        await waitForFirstResponse();
        await collectSsr();
        let sawAnyResponse = await scrollAndCollect();

        // Fallback: the "Top" search tab sometimes works when the "Videos" tab does not.
        if ((request.userData.found ?? 0) === 0 && request.userData.source === 'keyword' && !(await isBlocked(page))) {
            const generalUrl = `https://www.tiktok.com/search?q=${encodeURIComponent(label)}`;
            log.info(`${label}: nothing on the Videos tab, trying ${generalUrl}`);
            await page.goto(generalUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
            await waitForFirstResponse();
            await collectSsr();
            sawAnyResponse = (await scrollAndCollect()) || sawAnyResponse;
        }
        pendingByRequest.delete(request.uniqueKey);

        const found = request.userData.found ?? 0;
        if (found === 0) {
            const blocked = await isBlocked(page);
            const loginWall = await hasLoginWall(page);
            await saveDebug(page, request, { blocked, loginWall, sawAnyResponse });
            if (blocked) {
                session?.retire();
                throw new Error(`CAPTCHA on ${label} — retrying with a new session/IP.`);
            }
            if (loginWall) {
                log.warning(`TikTok shows a login wall for ${label}. Add the "sessionid" cookie in the input to search while logged in.`);
            }
            if (!sawAnyResponse) {
                session?.retire();
                throw new Error(`No search data loaded for ${label} — retrying.`);
            }
        }
        apiLogByRequest.delete(request.uniqueKey);
        log.info(`${label}: ${found} videos (total ${state.count}/${maxItems})`);
    },
    failedRequestHandler({ request }, error) {
        log.error(`Giving up on ${request.userData.query}: ${error.message}`);
    },
});

await crawler.run(startUrls);

// Output ordering for non-relevance sorts.
const sorters = {
    VIEWS: (a, b) => b.views - a.views,
    LIKES: (a, b) => b.likes - a.likes,
    SHARES: (a, b) => b.shares - a.shares,
    ENGAGEMENT: (a, b) => (b.metrics.engagementRate ?? 0) - (a.metrics.engagementRate ?? 0),
    VIRAL_RATIO: (a, b) => (b.metrics.viralRatio ?? 0) - (a.metrics.viralRatio ?? 0),
    NEWEST: (a, b) => (b.uploadedAt ?? 0) - (a.uploadedAt ?? 0),
};
if (!pushImmediately && collected.length) {
    collected.sort(sorters[sortBy] ?? (() => 0));
    for (let i = 0; i < collected.length; i += 500) await Actor.pushData(collected.slice(i, i + 500));
}

if (generateReport && collected.length) {
    const summary = analyze(collected, { language: reportLanguage });
    await Actor.setValue('SUMMARY', summary);
    await Actor.setValue('REPORT', renderReport(summary, { language: reportLanguage }), { contentType: 'text/html; charset=utf-8' });
    const storeId = Actor.getEnv().defaultKeyValueStoreId;
    if (storeId) log.info(`Report: https://api.apify.com/v2/key-value-stores/${storeId}/records/REPORT`);
}

const msg = `Done: ${collected.length} videos from ${keywordList.length + hashtagList.length} queries.`;
log.info(msg);
await Actor.exit(msg);
