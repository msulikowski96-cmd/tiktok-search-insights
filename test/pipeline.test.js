import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractItems, mapItem, hookOf } from '../src/mapper.js';
import { analyze, median } from '../src/analytics.js';
import { renderReport } from '../src/report.js';
import { rawItems, searchItemFull, searchGeneralFull, challengeItemList } from './fixtures.js';

const NOW = Date.parse('2026-10-16T00:00:00Z');
const ctx = { keyword: 'cytaty motywacyjne', inputSource: 'keyword', timezone: 'Europe/Warsaw', now: NOW };

test('extracts items from every known response shape', () => {
    assert.equal(extractItems(searchItemFull).length, 4);
    assert.equal(extractItems(searchGeneralFull).length, 3);
    assert.equal(extractItems(challengeItemList).length, 3);
    assert.equal(extractItems({ statusCode: 0 }).length, 0);
    assert.equal(extractItems(null).length, 0);
    const ssr = { __DEFAULT_SCOPE__: { 'webapp.video-detail': { itemInfo: { itemStruct: rawItems[0] } } } };
    assert.equal(extractItems(ssr).length, 1);
});

test('maps a raw item to the compatible output format', () => {
    const r = mapItem(rawItems[0], ctx);
    assert.equal(r.id, '7593665519165771030');
    assert.equal(r.views, 1300000);
    assert.equal(r.shares, 87100);
    assert.equal(r.channel.username, 'michalll2132');
    assert.equal(r.channel.followers, 8897);
    assert.equal(r.postPage, 'https://www.tiktok.com/@michalll2132/video/7593665519165771030');
    assert.deepEqual(r.hashtags, ['motywacja', 'rozwoj', 'prawda', 'cytaty', 'życie']);
    assert.equal(r.uploadedAtFormatted, '2026-01-10T09:40:43.000Z');
    assert.equal(r.keyword, 'cytaty motywacyjne');
    // derived metrics
    assert.equal(r.metrics.engagementRate, 13.65); // (82600+913+87100+6866)/1.3M
    assert.equal(r.metrics.viralRatio, 146.12);
    assert.equal(r.metrics.postedHour, 10); // 09:40 UTC = 10:40 in Warsaw (CET in January)
    assert.equal(r.metrics.postedWeekday, 6); // Saturday
    assert.equal(r.metrics.hasOriginalSound, true);
    assert.equal(r.metrics.hashtagCount, 5);
});

test('falls back to statsV2 strings and caption hashtags', () => {
    const raw = { ...rawItems[1], stats: undefined, textExtra: [] };
    const r = mapItem(raw, ctx);
    assert.equal(r.views, 949700);
    assert.ok(r.hashtags.includes('dyscyplina'));
});

test('detects original sound by title when flag is missing', () => {
    const raw = { ...rawItems[3], music: { title: 'oryginalny dźwięk' } };
    assert.equal(mapItem(raw, ctx).metrics.hasOriginalSound, true);
    const raw2 = { ...rawItems[7], music: { title: 'biting bullets' } };
    assert.equal(mapItem(raw2, ctx).metrics.hasOriginalSound, false);
});

test('hook is the first sentence without hashtags', () => {
    assert.equal(hookOf('Poukładana głowa to 90% sukcesu. Reszta to praca #motywacja'), 'Poukładana głowa to 90% sukcesu.');
    assert.equal(hookOf('#motywacja #cytaty'), '');
    assert.equal(hookOf('Linia pierwsza\nLinia druga #x'), 'Linia pierwsza');
});

test('median', () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 2, 3]), 2.5);
    assert.equal(median([]), null);
});

test('analyzes the real sample', () => {
    const recs = rawItems.map((r) => mapItem(r, ctx));
    const s = analyze(recs, { language: 'pl' });
    assert.equal(s.totals.videos, 10);
    assert.equal(s.totals.creators, 10);
    assert.equal(s.sampleWarning, true);
    assert.equal(s.sound.original.count, 6);
    assert.equal(s.sound.music.count, 4);
    assert.ok(s.sound.original.medianViews > s.sound.music.medianViews);
    assert.equal(s.mostUsedHashtags[0].tag, 'motywacja');
    assert.equal(s.mostUsedHashtags[0].count, 10);
    assert.equal(s.topByViews[0].creator, 'michalll2132');
    assert.ok(s.smallCreatorVirals.some((v) => v.creator === 'pikmotywacji'));
    assert.ok(s.recommendations.length >= 4);
    assert.ok(s.recommendations.some((t) => t.includes('lektor')));
    // videos with duration 0 (photo slideshows) are not counted in any duration bucket
    assert.equal(s.duration.reduce((a, b) => a + b.count, 0), 8);
});

test('renders a self-contained HTML report and escapes captions', () => {
    const recs = rawItems.map((r) => mapItem(r, ctx));
    recs[0].title = '<script>alert(1)</script> Ataki';
    recs[0].metrics.hook = '<script>alert(1)</script>';
    const html = renderReport(analyze(recs, { language: 'pl' }), { language: 'pl' });
    assert.ok(html.startsWith('<!doctype html>'));
    assert.ok(!html.includes('<script>alert'));
    assert.ok(!/<script\s+src=/i.test(html));
    assert.ok(html.includes('Wnioski'));
    const en = renderReport(analyze(recs, { language: 'en' }), { language: 'en' });
    assert.ok(en.includes('Takeaways'));
});
