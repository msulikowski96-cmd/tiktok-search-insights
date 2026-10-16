# TikTok Search Scraper + Insights

Scrape TikTok videos by **keyword** or **hashtag** and get not only the raw data, but a ready-made **insights report**: what performs in your niche, when to post, how long videos should be, which hashtags carry reach and which small creators are going viral.

No login needed in most cases. Output is compatible with popular TikTok scrapers (`id`, `title`, `views`, `likes`, `channel.*`, `video.*`, `song.*`), so existing pipelines keep working.

## What you get

**Per video** (dataset):
- Views, likes, comments, shares, saves (bookmarks)
- Caption, hashtags, upload time, permalink
- Creator: username, name, followers, following, total likes, video count, verified flag, bio
- Video: duration, size, cover, video URL; sound: title, artist, whether it is original sound; subtitles; location
- **Derived metrics** (`metrics.*`): engagement rate, like / share / save / comment rate, **views-to-followers ratio** (viral ratio), views per day, video age, posting hour and weekday in your time zone, hashtag count, caption length, original sound (voice-over) flag and the **hook** (first sentence of the caption)
- Which keyword or hashtag found the video

**Per run** (key-value store):
- `REPORT` — an HTML report you can open in the browser and share
- `SUMMARY` — the same insights as JSON, for your own dashboards or AI agents

The report answers:
- Which **posting hours and weekdays** get the highest median views
- The **video length** sweet spot
- **Voice-over / original sound vs. music** — which wins in this niche
- **How many hashtags** to use, and which hashtags have the highest median views, share and save rates
- **Best hooks** — first sentences of the highest-engagement captions
- **Small accounts that went viral** (≤20k followers, 10×+ views vs. followers)
- Top videos by views, shares and saves, and top creators
- Plain-language takeaways (Polish or English)

## Why this Actor

| | This Actor | Typical TikTok search scrapers |
|---|---|---|
| Raw video data | ✅ | ✅ |
| Hashtag feeds in the same run | ✅ | Sometimes |
| Engagement, share, save rates per video | ✅ | ❌ |
| Viral ratio (views / followers) | ✅ | ❌ |
| Posting hour & weekday in your time zone | ✅ | ❌ |
| HTML insights report + JSON summary | ✅ | ❌ |
| Filters: min views, max age, max followers | ✅ | Partial |
| Sorting by engagement / viral ratio | ✅ | ❌ |

## Input

| Field | Description |
|---|---|
| `keywords` | Search terms, as typed in the TikTok search bar |
| `hashtags` | Hashtag feeds (with or without `#`) |
| `maxItems` | Total cap of videos (default 200) |
| `maxItemsPerQuery` | Cap per keyword or hashtag (default 100) |
| `sortBy` | `RELEVANCE`, `VIEWS`, `LIKES`, `SHARES`, `ENGAGEMENT`, `VIRAL_RATIO`, `NEWEST` |
| `minViews`, `maxAgeDays`, `maxFollowers` | Filters |
| `uniqueAuthors` | One video per creator (creator discovery) |
| `generateReport`, `timezone`, `reportLanguage` | Insights report settings |
| `proxyConfiguration` | Residential proxy recommended; pick your audience's country |
| `sessionCookie` | Optional `sessionid` cookie if TikTok shows a login wall |

Example:

```json
{
  "keywords": ["cytaty motywacyjne", "mądre cytaty"],
  "hashtags": ["motywacja"],
  "maxItems": 300,
  "sortBy": "VIRAL_RATIO",
  "maxAgeDays": 90,
  "timezone": "Europe/Warsaw",
  "reportLanguage": "pl",
  "proxyConfiguration": { "useApifyProxy": true, "apifyProxyGroups": ["RESIDENTIAL"], "apifyProxyCountry": "PL" }
}
```

## Output example

```json
{
  "id": "7593665519165771030",
  "title": "ŻYCIOWA PRAWDA #motywacja #cytaty #życie",
  "views": 1300000,
  "likes": 82600,
  "comments": 913,
  "shares": 87100,
  "bookmarks": 6866,
  "hashtags": ["motywacja", "cytaty", "życie"],
  "uploadedAtFormatted": "2026-01-10T09:40:43.000Z",
  "postPage": "https://www.tiktok.com/@michalll2132/video/7593665519165771030",
  "channel": { "username": "michalll2132", "followers": 8897, "verified": false },
  "video": { "duration": 25, "cover": "https://..." },
  "song": { "title": "dźwięk oryginalny", "original": true },
  "metrics": {
    "engagementRate": 13.65,
    "shareRate": 6.7,
    "saveRate": 0.528,
    "viralRatio": 146.12,
    "postedHour": 10,
    "postedWeekday": 6,
    "hasOriginalSound": true,
    "hook": "ŻYCIOWA PRAWDA👂🫵👂"
  },
  "keyword": "cytaty motywacyjne"
}
```

## Tips

- **Use residential proxy** in the country of your audience. TikTok serves results based on IP location and blocks datacenter IPs fast.
- TikTok usually stops serving a single search after a few hundred videos. For more data, add more keywords and hashtags instead of raising the per-query cap.
- With fewer than ~50 videos the report marks itself as a small sample. 200+ videos give stable insights.
- Photo carousels have `video.duration` of 0 and are left out of the length statistics.

## Limitations

TikTok changes its website often. If a run returns no data, the Actor retries with a new browser fingerprint and IP; persistent failures usually mean TikTok changed something and the Actor needs an update. Only publicly visible data is collected.

## Legal

This Actor collects publicly available data. You are responsible for using the data in line with TikTok's terms, GDPR and other applicable law, especially when processing personal data of creators.
