# Google Search Console API + Article Health Management

## Overview

Two features:
1. **Auto-fetch GSC data** via Google Search Console API (service account auth) - replaces manual CSV downloads
2. **Article health management** - cross-references Ghost posts with GSC data to find dead/underperforming articles, with options to report, unpublish, or rewrite

## Part 1: Google Search Console API Integration

### Authentication: Service Account

One-time setup:
1. Create Google Cloud project, enable Search Console API
2. Create service account, download JSON key file
3. Add service account email as user in Google Search Console (read access)
4. Save key as `google-service-account.json` (gitignored)

### New file: `search-console-client.js`

Uses `googleapis` npm package with service account credentials.

**Functions:**
- `fetchQueryData(siteUrl, startDate, endDate)` - query performance (clicks, impressions, CTR, position)
- `fetchPageData(siteUrl, startDate, endDate)` - page-level performance
- `fetchDeviceData(siteUrl, startDate, endDate)` - mobile/desktop/tablet breakdown
- `fetchCountryData(siteUrl, startDate, endDate)` - geographic data
- `fetchDailyData(siteUrl, startDate, endDate)` - daily time series
- `fetchAll(siteUrl, startDate, endDate)` - runs all above

### Data Storage

- Saves to `searchconsole/YYYY-MM-DD/` as JSON files: `queries.json`, `pages.json`, `devices.json`, `countries.json`, `daily.json`
- Update `seo-gaps.js` to read JSON in addition to CSV

### CLI Command

```
node index.js fetch-gsc [--days 28] [--start YYYY-MM-DD] [--end YYYY-MM-DD]
```

Default: last 28 days.

### Config

New `.env` variables:
- `GOOGLE_SERVICE_ACCOUNT_PATH=./google-service-account.json`
- `GSC_SITE_URL=https://minekvitteringer.no`

### Dependency

- `googleapis` npm package

## Part 2: Article Health Management

### New file: `article-health.js`

Cross-references Ghost posts with Search Console page data.

### Health Classification

For articles older than 60 days:

| Status | Impressions | Action |
|--------|------------|--------|
| Healthy | >= 50 | None |
| Underperforming | 10-49 | Monitor |
| Dead | < 10 | Flag for action |
| Too New | (< 60 days old) | Skip |

### CLI Commands

**1. `node index.js article-health`**
- Full health report grouped by status
- Shows: title, URL, published date, age, impressions, clicks, CTR, position
- Summary stats at bottom

**2. `node index.js unpublish-dead [--dry-run] [--min-age 60]`**
- Lists dead articles, asks confirmation
- Changes Ghost status to "draft" (reversible)
- `--dry-run` preview mode
- Logs to `data/unpublished-articles.json`

**3. `node index.js rewrite-dead [--autopost] [--limit 5]`**
- Regenerates dead articles with AI
- Keeps same URL slug (preserve backlinks)
- Updates Ghost post in-place
- `--limit` caps rewrites per run
- `--autopost` publishes immediately vs draft

### Ghost API Additions

New functions needed in `ghost-client.js`:
- `updatePost(postId, data)` - update existing post (for rewrite)
- `draftPost(postId)` - change post status to draft (for unpublish)

### Data Flow

```
Ghost (all posts) + Search Console (page data) + generated-topics.json (dates)
    → Match by URL
    → Calculate age + performance
    → Classify health
    → Report / Unpublish / Rewrite
```
