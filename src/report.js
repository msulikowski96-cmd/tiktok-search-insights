// Renders the insights summary as a self-contained HTML page (no external scripts).
import { weekdayName } from './analytics.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const T = {
    pl: {
        title: 'Raport TikTok', videos: 'Filmy', creators: 'Twórcy', medViews: 'Mediana wyświetleń',
        medEng: 'Mediana zaangażowania', medViral: 'Mediana wyśw./obserw.', recs: 'Wnioski',
        hours: 'Mediana wyświetleń wg godziny publikacji', weekdays: 'Wg dnia tygodnia',
        duration: 'Wg długości filmu', tagCount: 'Wg liczby hashtagów', sound: 'Lektor / własny dźwięk vs muzyka',
        original: 'Własny dźwięk', music: 'Muzyka', tags: 'Hashtagi (mediana wyświetleń)', tag: 'Hashtag',
        count: 'Filmy', views: 'Wyświetlenia', eng: 'Zaang. %', share: 'Udostęp. %', save: 'Zapisy %',
        small: 'Małe konta z wiralami', hooks: 'Najlepsze haczyki (pierwsze zdanie opisu)', hook: 'Haczyk',
        top: 'Najczęściej oglądane', topCreators: 'Twórcy', followers: 'Obserw.', ratio: 'Wyśw./obserw.',
        warn: 'Mała próbka — traktuj wnioski jako wskazówki, nie pewniki.', keywords: 'Hasła', link: 'link',
        generated: 'Wygenerowano', none: 'Brak danych',
    },
    en: {
        title: 'TikTok report', videos: 'Videos', creators: 'Creators', medViews: 'Median views',
        medEng: 'Median engagement', medViral: 'Median views/followers', recs: 'Takeaways',
        hours: 'Median views by posting hour', weekdays: 'By weekday',
        duration: 'By video length', tagCount: 'By number of hashtags', sound: 'Voice-over / original sound vs music',
        original: 'Original sound', music: 'Music', tags: 'Hashtags (median views)', tag: 'Hashtag',
        count: 'Videos', views: 'Views', eng: 'Eng. %', share: 'Share %', save: 'Save %',
        small: 'Small accounts that went viral', hooks: 'Best hooks (first sentence of caption)', hook: 'Hook',
        top: 'Most viewed', topCreators: 'Creators', followers: 'Followers', ratio: 'Views/followers',
        warn: 'Small sample — treat these as hints, not facts.', keywords: 'Keywords', link: 'link',
        generated: 'Generated', none: 'No data',
    },
};

const fmtN = (x, lang) => (x === null || x === undefined ? '–' : Math.round(x).toLocaleString(lang === 'pl' ? 'pl-PL' : 'en-US'));
const compact = (x, lang) => (x === null || x === undefined ? '–' : new Intl.NumberFormat(lang === 'pl' ? 'pl-PL' : 'en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(x));

function bars(rows, labelOf, lang, { highlight } = {}) {
    const max = Math.max(1, ...rows.map((r) => r.medianViews ?? 0));
    const items = rows.map((r) => {
        const pct = r.medianViews ? Math.max(2, (r.medianViews / max) * 100) : 0;
        const hl = highlight && highlight(r) ? ' hl' : '';
        return `<div class="bar-row"><span class="bar-label">${esc(labelOf(r))}</span>
<span class="bar-track"><span class="bar-fill${hl}" style="width:${pct}%"></span></span>
<span class="bar-val">${r.count ? compact(r.medianViews, lang) : '–'}<small> · ${r.count}</small></span></div>`;
    }).join('');
    return `<div class="bars">${items}</div>`;
}

function table(headers, rows) {
    if (!rows.length) return '';
    return `<div class="tbl"><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

export function renderReport(s, { language = 'pl' } = {}) {
    const t = T[language] ?? T.en;
    const L = language;
    const bestHour = s.best.hour?.hour;
    const bestDay = s.best.weekday?.weekday;
    const link = (url) => `<a href="${esc(url)}" target="_blank" rel="noopener">${t.link}</a>`;

    const kpis = [
        [t.videos, fmtN(s.totals.videos, L)],
        [t.creators, fmtN(s.totals.creators, L)],
        [t.medViews, compact(s.totals.medianViews, L)],
        [t.medEng, s.totals.medianEngagement === null ? '–' : `${s.totals.medianEngagement}%`],
        [t.medViral, s.totals.medianViralRatio ?? '–'],
    ].map(([k, v]) => `<div class="kpi"><div class="kpi-v">${esc(v)}</div><div class="kpi-k">${esc(k)}</div></div>`).join('');

    const soundRows = [
        { label: t.original, ...s.sound.original },
        { label: t.music, ...s.sound.music },
    ];

    return `<!doctype html>
<html lang="${esc(L)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t.title)}</title>
<style>
:root{--bg:#fafaf7;--fg:#1b1b1b;--muted:#6b6b6b;--card:#fff;--line:#e7e5df;--accent:#e2475b;--accent2:#25b8c4;--track:#efede8}
@media (prefers-color-scheme:dark){:root{--bg:#141414;--fg:#f1f1ee;--muted:#a3a3a0;--card:#1d1d1d;--line:#2d2d2b;--track:#2a2a28}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:960px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:28px;margin:0 0 4px}h2{font-size:18px;margin:32px 0 12px}
.sub{color:var(--muted);font-size:13px}.warn{background:#fff4d6;color:#6b4e00;padding:10px 14px;border-radius:10px;margin:16px 0}
@media (prefers-color-scheme:dark){.warn{background:#3a2f12;color:#f3d98c}}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:18px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px}
.kpi-v{font-size:24px;font-weight:700}.kpi-k{color:var(--muted);font-size:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}
ul.recs{margin:0;padding-left:20px}ul.recs li{margin:6px 0}
.bars{display:flex;flex-direction:column;gap:5px}.bar-row{display:grid;grid-template-columns:72px 1fr 92px;gap:8px;align-items:center;font-size:13px}
.bar-label{color:var(--muted)}.bar-track{background:var(--track);border-radius:4px;height:14px;overflow:hidden}
.bar-fill{display:block;height:100%;background:var(--accent2);border-radius:4px}.bar-fill.hl{background:var(--accent)}
.bar-val{text-align:right;font-variant-numeric:tabular-nums}.bar-val small{color:var(--muted)}
.tbl{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px}
th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:600}
td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}a{color:var(--accent)}
</style></head><body><main>
<h1>${esc(t.title)}</h1>
<div class="sub">${esc(t.keywords)}: ${esc(s.totals.keywords.join(', ') || '–')} · ${esc(t.generated)}: ${esc(new Date(s.generatedAt).toLocaleString(L === 'pl' ? 'pl-PL' : 'en-US'))}</div>
${s.sampleWarning ? `<div class="warn">${esc(t.warn)}</div>` : ''}
<div class="kpis">${kpis}</div>

<h2>${esc(t.recs)}</h2>
<div class="card">${s.recommendations.length ? `<ul class="recs">${s.recommendations.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : esc(t.none)}</div>

<h2>${esc(t.hours)}</h2>
<div class="card">${bars(s.byHour, (r) => `${r.hour}:00`, L, { highlight: (r) => r.hour === bestHour })}</div>

<div class="grid2">
<div><h2>${esc(t.weekdays)}</h2><div class="card">${bars(s.byWeekday, (r) => weekdayName(r.weekday, L).slice(0, 3), L, { highlight: (r) => r.weekday === bestDay })}</div></div>
<div><h2>${esc(t.duration)}</h2><div class="card">${bars(s.duration, (r) => r.label, L, { highlight: (r) => r.label === s.best.duration?.label })}</div></div>
<div><h2>${esc(t.tagCount)}</h2><div class="card">${bars(s.hashtagCount, (r) => r.label, L, { highlight: (r) => r.label === s.best.hashtagCount?.label })}</div></div>
<div><h2>${esc(t.sound)}</h2><div class="card">${bars(soundRows, (r) => r.label, L)}
${table(['', t.share, t.save], soundRows.map((r) => [esc(r.label), `<span class="n">${r.medianShareRate ?? '–'}</span>`, `<span class="n">${r.medianSaveRate ?? '–'}</span>`]))}</div></div>
</div>

<h2>${esc(t.tags)}</h2>
<div class="card">${table([t.tag, t.count, t.views, t.eng, t.share, t.save], s.hashtags.slice(0, 20).map((h) => [
        `#${esc(h.tag)}`, `<span class="n">${h.count}</span>`, `<span class="n">${compact(h.medianViews, L)}</span>`,
        `<span class="n">${h.medianEngagement ?? '–'}</span>`, `<span class="n">${h.medianShareRate ?? '–'}</span>`, `<span class="n">${h.medianSaveRate ?? '–'}</span>`,
    ])) || esc(t.none)}</div>

<h2>${esc(t.hooks)}</h2>
<div class="card">${table([t.hook, t.views, t.eng, ''], s.topHooks.map((h) => [
        esc(h.hook), `<span class="n">${compact(h.views, L)}</span>`, `<span class="n">${h.engagementRate ?? '–'}</span>`, link(h.url),
    ])) || esc(t.none)}</div>

<h2>${esc(t.small)}</h2>
<div class="card">${table(['@', t.followers, t.views, t.ratio, ''], s.smallCreatorVirals.map((v) => [
        esc(v.creator), `<span class="n">${compact(v.followers, L)}</span>`, `<span class="n">${compact(v.views, L)}</span>`, `<span class="n">${v.viralRatio}×</span>`, link(v.url),
    ])) || esc(t.none)}</div>

<h2>${esc(t.top)}</h2>
<div class="card">${table(['', t.views, t.share, t.eng, '@', ''], s.topByViews.map((v) => [
        esc(v.caption.slice(0, 90)), `<span class="n">${compact(v.views, L)}</span>`, `<span class="n">${compact(v.shares, L)}</span>`,
        `<span class="n">${v.engagementRate ?? '–'}</span>`, esc(v.creator), link(v.url),
    ])) || esc(t.none)}</div>

<h2>${esc(t.topCreators)}</h2>
<div class="card">${table(['@', t.followers, t.count, t.views, t.ratio], s.creators.slice(0, 15).map((c) => [
        c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.username)}</a>` : esc(c.username),
        `<span class="n">${compact(c.followers, L)}</span>`, `<span class="n">${c.videosFound}</span>`,
        `<span class="n">${compact(c.totalViews, L)}</span>`, `<span class="n">${c.medianViralRatio ?? '–'}</span>`,
    ])) || esc(t.none)}</div>
</main></body></html>`;
}
