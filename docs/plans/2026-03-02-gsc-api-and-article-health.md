# GSC API Auto-Fetch + Article Health Management — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace manual CSV downloads from Google Search Console with automated API fetching, and add article health monitoring with unpublish/rewrite capabilities for dead articles.

**Architecture:** Two new modules (`search-console-client.js` for GSC API, `article-health.js` for health analysis) integrated into the existing Commander.js CLI. Service account auth for GSC. Cross-references Ghost posts with GSC page data to classify article health.

**Tech Stack:** `googleapis` npm package for GSC API, existing Ghost API via `ghost-client.js`, existing AI generation via `article-writer.js`.

---

### Task 1: Install googleapis and add config

**Files:**
- Modify: `package.json`
- Modify: `.env`
- Modify: `config.js:1-121`
- Modify: `.gitignore:1-140`

**Step 1: Install googleapis**

Run: `npm install googleapis`

**Step 2: Add service account config to .env**

Add these lines to the end of `.env`:

```
GOOGLE_SERVICE_ACCOUNT_PATH=./google-service-account.json
GSC_SITE_URL=https://minekvitteringer.no
```

**Step 3: Add to .gitignore**

Add at the end of `.gitignore`:

```
# Google service account key
google-service-account.json
```

**Step 4: Update config.js to include GSC settings**

Add these two new fields to the config object in `config.js`, after line 120 (`searchConsolePath: './searchconsole'`):

```javascript
  // Google Search Console API
  gscServiceAccountPath: process.env.GOOGLE_SERVICE_ACCOUNT_PATH || './google-service-account.json',
  gscSiteUrl: process.env.GSC_SITE_URL || 'https://minekvitteringer.no',
```

**Step 5: Commit**

```bash
git add package.json package-lock.json config.js .env .gitignore
git commit -m "feat: add googleapis dependency and GSC config"
```

---

### Task 2: Create search-console-client.js

**Files:**
- Create: `search-console-client.js`

**Step 1: Create the GSC client module**

Create `search-console-client.js` with this content:

```javascript
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';

// Authenticate with Google using service account
async function getAuthClient() {
  const keyPath = config.gscServiceAccountPath;

  if (!fs.existsSync(keyPath)) {
    throw new Error(
      `Service account key not found at: ${keyPath}\n` +
      'Setup instructions:\n' +
      '1. Go to https://console.cloud.google.com\n' +
      '2. Create a project (or select existing)\n' +
      '3. Enable "Google Search Console API"\n' +
      '4. Create a Service Account under IAM & Admin\n' +
      '5. Create and download a JSON key for the service account\n' +
      '6. Save it as google-service-account.json in project root\n' +
      '7. In Google Search Console, add the service account email as a user (read access)'
    );
  }

  const keyFile = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));

  const auth = new google.auth.GoogleAuth({
    credentials: keyFile,
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
  });

  return auth;
}

// Format date as YYYY-MM-DD
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

// Get default date range (last 28 days, but GSC data has ~3 day delay)
function getDefaultDateRange() {
  const end = new Date();
  end.setDate(end.getDate() - 3); // GSC data is delayed ~3 days
  const start = new Date(end);
  start.setDate(start.getDate() - 28);
  return { startDate: formatDate(start), endDate: formatDate(end) };
}

// Fetch query-level data (search terms with clicks, impressions, CTR, position)
export async function fetchQueryData(siteUrl, startDate, endDate, rowLimit = 5000) {
  const auth = await getAuthClient();
  const searchconsole = google.searchconsole({ version: 'v1', auth });

  const response = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ['query'],
      rowLimit,
      dataState: 'final',
    },
  });

  return (response.data.rows || []).map(row => ({
    query: row.keys[0],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: Math.round(row.ctr * 10000) / 100, // Convert to percentage
    position: Math.round(row.position * 100) / 100,
  }));
}

// Fetch page-level data (URLs with performance)
export async function fetchPageData(siteUrl, startDate, endDate, rowLimit = 5000) {
  const auth = await getAuthClient();
  const searchconsole = google.searchconsole({ version: 'v1', auth });

  const response = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ['page'],
      rowLimit,
      dataState: 'final',
    },
  });

  return (response.data.rows || []).map(row => ({
    page: row.keys[0],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: Math.round(row.ctr * 10000) / 100,
    position: Math.round(row.position * 100) / 100,
  }));
}

// Fetch device breakdown data
export async function fetchDeviceData(siteUrl, startDate, endDate) {
  const auth = await getAuthClient();
  const searchconsole = google.searchconsole({ version: 'v1', auth });

  const response = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ['device'],
      dataState: 'final',
    },
  });

  return (response.data.rows || []).map(row => ({
    device: row.keys[0],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: Math.round(row.ctr * 10000) / 100,
    position: Math.round(row.position * 100) / 100,
  }));
}

// Fetch country-level data
export async function fetchCountryData(siteUrl, startDate, endDate) {
  const auth = await getAuthClient();
  const searchconsole = google.searchconsole({ version: 'v1', auth });

  const response = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ['country'],
      dataState: 'final',
    },
  });

  return (response.data.rows || []).map(row => ({
    country: row.keys[0],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: Math.round(row.ctr * 10000) / 100,
    position: Math.round(row.position * 100) / 100,
  }));
}

// Fetch daily time series data
export async function fetchDailyData(siteUrl, startDate, endDate) {
  const auth = await getAuthClient();
  const searchconsole = google.searchconsole({ version: 'v1', auth });

  const response = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ['date'],
      dataState: 'final',
    },
  });

  return (response.data.rows || []).map(row => ({
    date: row.keys[0],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: Math.round(row.ctr * 10000) / 100,
    position: Math.round(row.position * 100) / 100,
  }));
}

// Fetch all data types and save to disk
export async function fetchAll(options = {}) {
  const siteUrl = options.siteUrl || config.gscSiteUrl;
  const { startDate, endDate } = options.startDate && options.endDate
    ? { startDate: options.startDate, endDate: options.endDate }
    : getDefaultDateRange();

  console.log(`\nFetching Search Console data for ${siteUrl}`);
  console.log(`Date range: ${startDate} to ${endDate}\n`);

  const results = {};

  console.log('  Fetching query data...');
  results.queries = await fetchQueryData(siteUrl, startDate, endDate);
  console.log(`  ✓ ${results.queries.length} queries`);

  console.log('  Fetching page data...');
  results.pages = await fetchPageData(siteUrl, startDate, endDate);
  console.log(`  ✓ ${results.pages.length} pages`);

  console.log('  Fetching device data...');
  results.devices = await fetchDeviceData(siteUrl, startDate, endDate);
  console.log(`  ✓ ${results.devices.length} device types`);

  console.log('  Fetching country data...');
  results.countries = await fetchCountryData(siteUrl, startDate, endDate);
  console.log(`  ✓ ${results.countries.length} countries`);

  console.log('  Fetching daily data...');
  results.daily = await fetchDailyData(siteUrl, startDate, endDate);
  console.log(`  ✓ ${results.daily.length} days`);

  // Save to disk
  const today = formatDate(new Date());
  const outputDir = path.join(config.searchConsolePath, today);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Save each dataset as JSON
  for (const [key, data] of Object.entries(results)) {
    const filePath = path.join(outputDir, `${key}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }

  // Save metadata
  const metadata = {
    siteUrl,
    startDate,
    endDate,
    fetchedAt: new Date().toISOString(),
    counts: {
      queries: results.queries.length,
      pages: results.pages.length,
      devices: results.devices.length,
      countries: results.countries.length,
      daily: results.daily.length,
    },
  };
  fs.writeFileSync(path.join(outputDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

  console.log(`\nData saved to ${outputDir}/`);

  // Print summary
  const totalClicks = results.queries.reduce((sum, q) => sum + q.clicks, 0);
  const totalImpressions = results.queries.reduce((sum, q) => sum + q.impressions, 0);
  console.log(`\nSummary:`);
  console.log(`  Total clicks: ${totalClicks.toLocaleString()}`);
  console.log(`  Total impressions: ${totalImpressions.toLocaleString()}`);
  console.log(`  Average CTR: ${totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : 0}%`);

  return results;
}

// Get page data for a specific URL (used by article-health)
export async function getPagePerformance(siteUrl, startDate, endDate) {
  return fetchPageData(siteUrl, startDate, endDate);
}
```

**Step 2: Commit**

```bash
git add search-console-client.js
git commit -m "feat: add Google Search Console API client with service account auth"
```

---

### Task 3: Update seo-gaps.js to support JSON data from API

**Files:**
- Modify: `seo-gaps.js:38-79`

**Step 1: Add JSON loading alongside CSV loading**

In `seo-gaps.js`, replace the `loadFolderData` function (lines 38-79) with a version that tries JSON first, then falls back to CSV:

```javascript
// Load data from a specific folder (JSON from API or CSV from manual download)
function loadFolderData(folderPath) {
  const data = { queries: [], pages: [] };

  // Try JSON first (from API fetch)
  const queriesJsonPath = path.join(folderPath, 'queries.json');
  const pagesJsonPath = path.join(folderPath, 'pages.json');

  if (fs.existsSync(queriesJsonPath)) {
    data.queries = JSON.parse(fs.readFileSync(queriesJsonPath, 'utf-8'));
  } else {
    // Fall back to CSV (manual download)
    const queriesCsvPath = path.join(folderPath, 'Forspørsler.csv');
    if (fs.existsSync(queriesCsvPath)) {
      const content = fs.readFileSync(queriesCsvPath, 'utf-8');
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
        delimiter: ','
      });

      data.queries = records.map(r => ({
        query: r['Populære søk'],
        clicks: parseInt(r['Klikk']) || 0,
        impressions: parseInt(r['Visninger']) || 0,
        ctr: parseFloat(r['Klikkfrekvens']?.replace('%', '').replace(',', '.')) || 0,
        position: parseFloat(r['Plassering']?.replace(',', '.')) || 0
      }));
    }
  }

  if (fs.existsSync(pagesJsonPath)) {
    data.pages = JSON.parse(fs.readFileSync(pagesJsonPath, 'utf-8'));
  } else {
    // Fall back to CSV (manual download)
    const pagesCsvPath = path.join(folderPath, 'Sider.csv');
    if (fs.existsSync(pagesCsvPath)) {
      const content = fs.readFileSync(pagesCsvPath, 'utf-8');
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
        delimiter: ','
      });

      data.pages = records.map(r => ({
        page: r['Mest populære sider'],
        clicks: parseInt(r['Klikk']) || 0,
        impressions: parseInt(r['Visninger']) || 0,
        ctr: parseFloat(r['Klikkfrekvens']?.replace('%', '').replace(',', '.')) || 0,
        position: parseFloat(r['Plassering']?.replace(',', '.')) || 0
      }));
    }
  }

  return data;
}
```

**Step 2: Commit**

```bash
git add seo-gaps.js
git commit -m "feat: support JSON data from GSC API alongside CSV in seo-gaps"
```

---

### Task 4: Add fetch-gsc command to index.js

**Files:**
- Modify: `index.js:1-31` (imports)
- Modify: `index.js` (add command after existing commands)

**Step 1: Add import for search-console-client**

Add this import after line 30 in `index.js` (after the claude-writer imports):

```javascript
import { fetchAll as fetchGscData } from './search-console-client.js';
```

**Step 2: Add the fetch-gsc command**

Add this command block in `index.js`, before the `program.parse()` line at the end:

```javascript
program
  .command('fetch-gsc')
  .description('Fetch data from Google Search Console API')
  .option('--days <number>', 'Number of days to fetch (default: 28)', '28')
  .option('--start <date>', 'Start date (YYYY-MM-DD)')
  .option('--end <date>', 'End date (YYYY-MM-DD)')
  .action(async (options) => {
    console.log('\n📊 Fetching Google Search Console data...\n');

    try {
      const fetchOptions = {};

      if (options.start && options.end) {
        fetchOptions.startDate = options.start;
        fetchOptions.endDate = options.end;
      } else {
        const days = parseInt(options.days);
        const end = new Date();
        end.setDate(end.getDate() - 3); // GSC data delay
        const start = new Date(end);
        start.setDate(start.getDate() - days);
        fetchOptions.startDate = start.toISOString().split('T')[0];
        fetchOptions.endDate = end.toISOString().split('T')[0];
      }

      await fetchGscData(fetchOptions);
      console.log('\n✅ Search Console data fetched successfully!');
    } catch (error) {
      console.error(`\n❌ Failed to fetch GSC data: ${error.message}`);
      process.exit(1);
    }
  });
```

**Step 3: Commit**

```bash
git add index.js
git commit -m "feat: add fetch-gsc CLI command for automated Search Console data"
```

---

### Task 5: Add updatePost and draftPost to ghost-client.js

**Files:**
- Modify: `ghost-client.js:62-95` (add new functions after getAllPostsWithContent)

**Step 1: Add updatePost function**

Add these functions after line 95 in `ghost-client.js` (after the `getAllPostsWithContent` function):

```javascript
// Update an existing post (for rewriting content)
export async function updatePost(postId, data) {
  const token = generateGhostToken();

  // First, get the current post to get its updated_at (required by Ghost API)
  const getUrl = `${config.ghostApiUrl}posts/${postId}/`;
  const getResponse = await fetch(getUrl, {
    headers: { 'Authorization': `Ghost ${token}` }
  });

  if (!getResponse.ok) {
    const error = await getResponse.json();
    throw new Error(`Ghost API error (get post): ${JSON.stringify(error)}`);
  }

  const current = await getResponse.json();
  const updatedAt = current.posts[0].updated_at;

  // Now update the post
  const updateUrl = `${config.ghostApiUrl}posts/${postId}/?source=html`;
  const postData = {
    posts: [{
      ...data,
      updated_at: updatedAt
    }]
  };

  const response = await fetch(updateUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Ghost ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(postData)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Ghost API error (update): ${JSON.stringify(error)}`);
  }

  const result = await response.json();
  return result.posts[0];
}

// Change a post to draft status (unpublish)
export async function draftPost(postId) {
  return updatePost(postId, { status: 'draft' });
}
```

**Step 2: Commit**

```bash
git add ghost-client.js
git commit -m "feat: add updatePost and draftPost to Ghost client for article management"
```

---

### Task 6: Create article-health.js

**Files:**
- Create: `article-health.js`

**Step 1: Create the article health analysis module**

Create `article-health.js`:

```javascript
import fs from 'fs';
import { config } from './config.js';
import { getAllPostsWithContent, updatePost, draftPost } from './ghost-client.js';
import { getPagePerformance } from './search-console-client.js';
import { generateArticle } from './article-writer.js';

const UNPUBLISHED_LOG = './data/unpublished-articles.json';
const GRACE_PERIOD_DAYS = 60;

// Health thresholds
const THRESHOLDS = {
  healthy: 50,        // >= 50 impressions
  underperforming: 10, // 10-49 impressions
  // dead: < 10 impressions
};

// Get all Ghost posts with their GSC performance data
export async function getArticleHealth() {
  console.log('Fetching Ghost posts...');
  const posts = await getAllPostsWithContent();

  if (posts.length === 0) {
    console.log('No published posts found in Ghost.');
    return [];
  }

  // Fetch GSC page data (last 28 days)
  console.log('Fetching Search Console page data...');
  const end = new Date();
  end.setDate(end.getDate() - 3);
  const start = new Date(end);
  start.setDate(start.getDate() - 28);
  const startDate = start.toISOString().split('T')[0];
  const endDate = end.toISOString().split('T')[0];

  let gscPages = [];
  try {
    gscPages = await getPagePerformance(config.gscSiteUrl, startDate, endDate);
  } catch (error) {
    console.log(`Warning: Could not fetch GSC data (${error.message}). Using local data if available.`);
    // Try loading from most recent local JSON
    gscPages = loadLocalPageData();
  }

  // Build a lookup map: normalize URL -> performance
  const gscMap = new Map();
  for (const page of gscPages) {
    // Normalize URL (remove trailing slash, lowercase)
    const normalizedUrl = page.page.replace(/\/$/, '').toLowerCase();
    gscMap.set(normalizedUrl, page);
  }

  // Cross-reference posts with GSC data
  const now = new Date();
  const articles = posts.map(post => {
    const publishedAt = new Date(post.published_at);
    const ageDays = Math.floor((now - publishedAt) / (1000 * 60 * 60 * 24));
    const postUrl = post.url.replace(/\/$/, '').toLowerCase();

    // Find GSC data for this post
    const gscData = gscMap.get(postUrl) || null;
    const impressions = gscData?.impressions || 0;
    const clicks = gscData?.clicks || 0;
    const ctr = gscData?.ctr || 0;
    const position = gscData?.position || 0;

    // Classify health
    let status;
    if (ageDays < GRACE_PERIOD_DAYS) {
      status = 'too-new';
    } else if (impressions >= THRESHOLDS.healthy) {
      status = 'healthy';
    } else if (impressions >= THRESHOLDS.underperforming) {
      status = 'underperforming';
    } else {
      status = 'dead';
    }

    return {
      id: post.id,
      title: post.title,
      slug: post.slug,
      url: post.url,
      publishedAt: post.published_at,
      ageDays,
      impressions,
      clicks,
      ctr,
      position,
      status,
      hasGscData: !!gscData,
    };
  });

  return articles;
}

// Load local page data from most recent searchconsole folder
function loadLocalPageData() {
  const basePath = config.searchConsolePath;
  if (!fs.existsSync(basePath)) return [];

  const entries = fs.readdirSync(basePath, { withFileTypes: true });
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const dateFolders = entries
    .filter(e => e.isDirectory() && datePattern.test(e.name))
    .sort((a, b) => b.name.localeCompare(a.name));

  if (dateFolders.length === 0) return [];

  const latestFolder = dateFolders[0].name;
  const jsonPath = `${basePath}/${latestFolder}/pages.json`;
  const csvPath = `${basePath}/${latestFolder}/Sider.csv`;

  if (fs.existsSync(jsonPath)) {
    return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  }

  // CSV fallback not needed here since we just need page URLs + impressions
  // The CSV parsing is handled by seo-gaps.js
  return [];
}

// Print a formatted health report
export function printHealthReport(articles) {
  const grouped = {
    dead: articles.filter(a => a.status === 'dead'),
    underperforming: articles.filter(a => a.status === 'underperforming'),
    healthy: articles.filter(a => a.status === 'healthy'),
    'too-new': articles.filter(a => a.status === 'too-new'),
  };

  console.log('\n====================================');
  console.log('   ARTICLE HEALTH REPORT');
  console.log('====================================\n');

  // Summary
  console.log(`Total articles: ${articles.length}`);
  console.log(`  Healthy (>= ${THRESHOLDS.healthy} imp):     ${grouped.healthy.length}`);
  console.log(`  Underperforming (${THRESHOLDS.underperforming}-${THRESHOLDS.healthy - 1} imp): ${grouped.underperforming.length}`);
  console.log(`  Dead (< ${THRESHOLDS.underperforming} imp):            ${grouped.dead.length}`);
  console.log(`  Too new (< ${GRACE_PERIOD_DAYS} days):        ${grouped['too-new'].length}`);

  // Dead articles (most important)
  if (grouped.dead.length > 0) {
    console.log('\n--- DEAD ARTICLES (< 10 impressions, > 60 days old) ---\n');
    for (const article of grouped.dead) {
      console.log(`  ${article.title}`);
      console.log(`    URL: ${article.url}`);
      console.log(`    Published: ${article.publishedAt?.split('T')[0]} (${article.ageDays} days ago)`);
      console.log(`    Impressions: ${article.impressions} | Clicks: ${article.clicks} | CTR: ${article.ctr}% | Pos: ${article.position}`);
      console.log(`    GSC data: ${article.hasGscData ? 'Yes' : 'No (not indexed?)'}`);
      console.log('');
    }
  }

  // Underperforming
  if (grouped.underperforming.length > 0) {
    console.log('\n--- UNDERPERFORMING ARTICLES (10-49 impressions) ---\n');
    for (const article of grouped.underperforming) {
      console.log(`  ${article.title}`);
      console.log(`    ${article.impressions} imp | ${article.clicks} clicks | ${article.ageDays} days old`);
    }
  }

  // Healthy (brief)
  if (grouped.healthy.length > 0) {
    console.log(`\n--- HEALTHY ARTICLES (${grouped.healthy.length} total) ---\n`);
    const top5 = grouped.healthy.sort((a, b) => b.impressions - a.impressions).slice(0, 5);
    for (const article of top5) {
      console.log(`  ${article.title} — ${article.impressions} imp, ${article.clicks} clicks`);
    }
    if (grouped.healthy.length > 5) {
      console.log(`  ... and ${grouped.healthy.length - 5} more healthy articles`);
    }
  }

  // Too new (brief)
  if (grouped['too-new'].length > 0) {
    console.log(`\n--- TOO NEW (${grouped['too-new'].length} articles < ${GRACE_PERIOD_DAYS} days old, skipped) ---\n`);
  }

  return grouped;
}

// Get only dead articles
export async function getDeadArticles(minAge = GRACE_PERIOD_DAYS) {
  const articles = await getArticleHealth();
  return articles.filter(a => a.status === 'dead' && a.ageDays >= minAge);
}

// Unpublish dead articles (set to draft)
export async function unpublishDeadArticles(options = {}) {
  const { dryRun = false, minAge = GRACE_PERIOD_DAYS } = options;
  const deadArticles = await getDeadArticles(minAge);

  if (deadArticles.length === 0) {
    console.log('No dead articles found to unpublish.');
    return [];
  }

  console.log(`\nFound ${deadArticles.length} dead articles:\n`);
  for (const article of deadArticles) {
    console.log(`  - ${article.title} (${article.ageDays} days, ${article.impressions} impressions)`);
  }

  if (dryRun) {
    console.log('\n[DRY RUN] No changes made.');
    return deadArticles;
  }

  const unpublished = [];
  for (const article of deadArticles) {
    try {
      await draftPost(article.id);
      console.log(`  Unpublished: ${article.title}`);
      unpublished.push({
        ...article,
        unpublishedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`  Failed to unpublish "${article.title}": ${error.message}`);
    }
  }

  // Log unpublished articles
  logUnpublished(unpublished);
  console.log(`\nUnpublished ${unpublished.length} of ${deadArticles.length} dead articles.`);

  return unpublished;
}

// Log unpublished articles for audit trail
function logUnpublished(articles) {
  let existing = [];
  if (fs.existsSync(UNPUBLISHED_LOG)) {
    existing = JSON.parse(fs.readFileSync(UNPUBLISHED_LOG, 'utf-8'));
  }

  existing.push(...articles);
  fs.writeFileSync(UNPUBLISHED_LOG, JSON.stringify(existing, null, 2));
}

// Rewrite dead articles with fresh AI content
export async function rewriteDeadArticles(options = {}) {
  const { autoPost = false, limit = 5, minAge = GRACE_PERIOD_DAYS } = options;
  const deadArticles = await getDeadArticles(minAge);

  if (deadArticles.length === 0) {
    console.log('No dead articles found to rewrite.');
    return [];
  }

  const toRewrite = deadArticles.slice(0, limit);
  console.log(`\nRewriting ${toRewrite.length} dead articles (of ${deadArticles.length} total):\n`);

  const rewritten = [];
  for (const article of toRewrite) {
    console.log(`\nRewriting: ${article.title}`);
    console.log(`  Original: ${article.url}`);

    try {
      // Generate new content for the same topic
      const topicInfo = {
        type: 'rewrite',
        topic: article.title,
        originalUrl: article.url,
        originalSlug: article.slug,
        query: article.title, // Use title as base query
      };

      const newArticle = await generateArticle('problem-solving', topicInfo);

      // Update the post in Ghost (keep same slug/URL)
      const updateData = {
        title: newArticle.title,
        html: newArticle.html,
        meta_title: newArticle.metaTitle || newArticle.title,
        meta_description: newArticle.metaDescription,
        custom_excerpt: newArticle.excerpt,
        status: autoPost ? 'published' : 'draft',
      };

      await updatePost(article.id, updateData);
      const status = autoPost ? 'Published' : 'Saved as draft';
      console.log(`  ✓ ${status}: ${newArticle.title}`);

      rewritten.push({
        originalTitle: article.title,
        newTitle: newArticle.title,
        url: article.url,
        rewrittenAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`  ✗ Failed to rewrite "${article.title}": ${error.message}`);
    }
  }

  console.log(`\nRewrote ${rewritten.length} of ${toRewrite.length} articles.`);
  return rewritten;
}
```

**Step 2: Commit**

```bash
git add article-health.js
git commit -m "feat: add article health analysis with dead detection, unpublish, and rewrite"
```

---

### Task 7: Add article-health, unpublish-dead, and rewrite-dead commands to index.js

**Files:**
- Modify: `index.js` (imports and commands)

**Step 1: Add imports**

Add this import after the `fetchAll` import (added in Task 4):

```javascript
import {
  getArticleHealth,
  printHealthReport,
  unpublishDeadArticles,
  rewriteDeadArticles
} from './article-health.js';
```

**Step 2: Add article-health command**

Add before `program.parse()`:

```javascript
program
  .command('article-health')
  .description('Analyze health of published articles using Search Console data')
  .action(async () => {
    console.log('\n🏥 Analyzing article health...\n');

    try {
      const articles = await getArticleHealth();
      printHealthReport(articles);
    } catch (error) {
      console.error(`\n❌ Failed: ${error.message}`);
      process.exit(1);
    }
  });
```

**Step 3: Add unpublish-dead command**

```javascript
program
  .command('unpublish-dead')
  .description('Unpublish dead articles (set to draft)')
  .option('--dry-run', 'Preview what would be unpublished without making changes')
  .option('--min-age <days>', 'Minimum age in days before considering an article dead', '60')
  .action(async (options) => {
    console.log('\n🗑️  Finding dead articles to unpublish...\n');

    try {
      await unpublishDeadArticles({
        dryRun: !!options.dryRun,
        minAge: parseInt(options.minAge),
      });
    } catch (error) {
      console.error(`\n❌ Failed: ${error.message}`);
      process.exit(1);
    }
  });
```

**Step 4: Add rewrite-dead command**

```javascript
program
  .command('rewrite-dead')
  .description('Rewrite dead articles with fresh AI content')
  .option('-a, --autopost', 'Publish rewritten articles immediately')
  .option('-l, --limit <number>', 'Maximum articles to rewrite', '5')
  .option('--min-age <days>', 'Minimum age in days', '60')
  .action(async (options) => {
    console.log('\n✍️  Rewriting dead articles...\n');

    try {
      await rewriteDeadArticles({
        autoPost: !!options.autopost,
        limit: parseInt(options.limit),
        minAge: parseInt(options.minAge),
      });
    } catch (error) {
      console.error(`\n❌ Failed: ${error.message}`);
      process.exit(1);
    }
  });
```

**Step 5: Commit**

```bash
git add index.js
git commit -m "feat: add article-health, unpublish-dead, and rewrite-dead CLI commands"
```

---

### Task 8: Verify and manual test

**Step 1: Check the CLI help works**

Run: `node index.js --help`
Expected: All new commands (fetch-gsc, article-health, unpublish-dead, rewrite-dead) should be listed.

**Step 2: Test fetch-gsc without credentials (should give helpful error)**

Run: `node index.js fetch-gsc`
Expected: Error message with setup instructions for the service account.

**Step 3: Test article-health (will work with Ghost data + local GSC data)**

Run: `node index.js article-health`
Expected: Should connect to Ghost, fetch posts, and show health report (may fallback to local GSC data if no API credentials yet).

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during manual testing"
```

---

### Task 9: Consolidate shared utilities into utils.js

**Files:**
- Create: `utils.js`
- Modify: `search-console-client.js` (use shared helpers)
- Modify: `article-health.js` (use shared helpers)
- Modify: `seo-gaps.js` (use shared helpers)

**Rationale:** Several patterns are duplicated across modules:
- Date formatting (`toISOString().split('T')[0]`)
- GSC default date range calculation (end - 3 days delay, start - N days)
- Scanning `searchconsole/YYYY-MM-DD/` folders for data
- Loading JSON or CSV from searchconsole folders

**Step 1: Create utils.js with shared helpers**

```javascript
import fs from 'fs';
import path from 'path';
import { config } from './config.js';

// Format a Date as YYYY-MM-DD
export function formatDate(date) {
  return date.toISOString().split('T')[0];
}

// Get default GSC date range (accounts for ~3 day data delay)
export function getGscDateRange(days = 28) {
  const end = new Date();
  end.setDate(end.getDate() - 3);
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  return { startDate: formatDate(start), endDate: formatDate(end) };
}

// Get all date folders from searchconsole directory, newest first
export function getSearchConsoleDateFolders() {
  const basePath = config.searchConsolePath;
  if (!fs.existsSync(basePath)) return [];

  const entries = fs.readdirSync(basePath, { withFileTypes: true });
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  return entries
    .filter(e => e.isDirectory() && datePattern.test(e.name))
    .map(e => ({
      name: e.name,
      date: new Date(e.name),
      path: path.join(basePath, e.name)
    }))
    .sort((a, b) => b.date - a.date);
}

// Calculate days between a date string and now
export function daysAgo(dateStr) {
  return Math.floor((new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24));
}
```

**Step 2: Update search-console-client.js to use utils**

Replace the local `formatDate`, `getDefaultDateRange` functions with imports from `utils.js`:

```javascript
import { formatDate, getGscDateRange } from './utils.js';
```

Remove the duplicate `formatDate` and `getDefaultDateRange` functions from `search-console-client.js`.

**Step 3: Update article-health.js to use utils**

Replace inline date math with:

```javascript
import { getGscDateRange, getSearchConsoleDateFolders } from './utils.js';
```

Replace the `loadLocalPageData` folder-scanning logic to use `getSearchConsoleDateFolders()`.

**Step 4: Update seo-gaps.js to use utils**

Replace the `getDateFolders` function with an import:

```javascript
import { getSearchConsoleDateFolders } from './utils.js';
```

Replace all calls to `getDateFolders()` with `getSearchConsoleDateFolders()`. Remove the old `getDateFolders` function.

**Step 5: Commit**

```bash
git add utils.js search-console-client.js article-health.js seo-gaps.js
git commit -m "refactor: consolidate shared date/folder utilities into utils.js"
```

---

## Google Cloud Setup Guide (for the user)

After implementation, the user needs to do this one-time setup:

1. Go to https://console.cloud.google.com
2. Create a new project (or select existing)
3. Go to APIs & Services > Enable APIs > search "Search Console API" > Enable
4. Go to IAM & Admin > Service Accounts > Create Service Account
5. Name it something like "blog-generator-gsc"
6. Click Create and Continue (no roles needed)
7. Click Done
8. Click the new service account > Keys tab > Add Key > Create New Key > JSON
9. Save the downloaded file as `google-service-account.json` in the project root
10. Copy the service account email (looks like `name@project.iam.gserviceaccount.com`)
11. Go to https://search.google.com/search-console
12. Select the property `https://minekvitteringer.no`
13. Settings > Users and permissions > Add user
14. Paste the service account email, set permission to "Full" or "Restricted"
15. Click Add

Then run: `node index.js fetch-gsc`
