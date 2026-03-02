import fs from 'fs';
import path from 'path';
import { config } from './config.js';
import { getGscDateRange, getSearchConsoleDateFolders, formatDate } from './utils.js';
import { getAllPostsWithContent, updatePost, draftPost } from './ghost-client.js';
import { getPagePerformance } from './search-console-client.js';
import { generateArticle } from './article-writer.js';

const UNPUBLISHED_LOG = './data/unpublished-articles.json';
const GRACE_PERIOD_DAYS = 60;
const THRESHOLDS = { healthy: 50, underperforming: 10 };

// ── Helpers ────────────────────────────────────────────────────────────

function daysSince(dateStr) {
  const published = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - published) / (1000 * 60 * 60 * 24));
}

function classifyArticle(impressions, ageDays, hasGscData) {
  if (ageDays < GRACE_PERIOD_DAYS) return 'too-new';
  if (!hasGscData) return 'dead'; // No GSC data at all means zero traffic
  if (impressions >= THRESHOLDS.healthy) return 'healthy';
  if (impressions >= THRESHOLDS.underperforming) return 'underperforming';
  return 'dead';
}

// ── Local CSV fallback ─────────────────────────────────────────────────

/**
 * Scan searchconsole/YYYY-MM-DD/ folders and load the most recent Sider.csv
 * as a fallback when the GSC API is unavailable.
 */
function loadLocalPageData() {
  const dateDirs = getSearchConsoleDateFolders();

  if (!dateDirs.length) {
    console.warn('  No searchconsole date folders found for fallback data');
    return [];
  }

  for (const dir of dateDirs) {
    // Try JSON first (from API fetch)
    const jsonPath = path.join(dir.path, 'pages.json');
    if (fs.existsSync(jsonPath)) {
      console.log(`  Loading local GSC fallback from ${dir.name}/pages.json`);
      return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    }
    // Fall back to CSV
    const csvPath = path.join(dir.path, 'Sider.csv');
    if (fs.existsSync(csvPath)) {
      console.log(`  Loading local GSC fallback from ${dir.name}/Sider.csv`);
      return parseSiderCsv(fs.readFileSync(csvPath, 'utf-8'));
    }
  }

  console.warn('  No Sider.csv found in any searchconsole date folder');
  return [];
}

/**
 * Parse the Norwegian GSC CSV export (Sider.csv).
 * Headers: Mest populære sider, Klikk, Visninger, Klikkfrekvens, Plassering
 */
function parseSiderCsv(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  // Skip header row
  return lines.slice(1).map(line => {
    // CSV fields are comma-separated; URL never contains commas
    const parts = line.split(',');
    if (parts.length < 5) return null;

    const url = parts[0].trim();
    const clicks = parseInt(parts[1], 10) || 0;
    const impressions = parseInt(parts[2], 10) || 0;
    const ctrStr = parts[3].replace('%', '').trim();
    const ctr = parseFloat(ctrStr) || 0;
    const position = parseFloat(parts[4]) || 0;

    return { url, clicks, impressions, ctr, position };
  }).filter(Boolean);
}

// ── Core: Article Health ───────────────────────────────────────────────

/**
 * Fetch Ghost posts and GSC page data, cross-reference by URL, and classify.
 * Falls back to local CSV data if the GSC API call fails.
 */
export async function getArticleHealth() {
  console.log('\n=== Article Health Check ===\n');

  // 1. Fetch all published posts from Ghost
  console.log('Fetching published posts from Ghost...');
  const posts = await getAllPostsWithContent();
  if (!posts.length) {
    console.error('No posts found in Ghost. Aborting health check.');
    return [];
  }

  // 2. Fetch GSC page data (last 28 days, end date offset by 3 days for processing delay)
  let gscPages = [];
  let usingFallback = false;

  try {
    const { startDate, endDate } = getGscDateRange();
    console.log(`Fetching GSC page data (${startDate} to ${endDate})...`);
    gscPages = await getPagePerformance(config.gscSiteUrl, startDate, endDate);
    console.log(`  Got ${gscPages.length} pages from GSC API`);
  } catch (err) {
    console.warn(`  GSC API failed: ${err.message}`);
    console.warn('  Falling back to local CSV data...');
    gscPages = loadLocalPageData();
    usingFallback = true;
  }

  // 3. Build lookup maps from GSC data
  //    Ghost returns URLs like https://ghost.mkapi.no/slug/
  //    GSC has URLs like https://minekvitteringer.no/blog/slug/
  //    So we match by slug (last path segment) as well as full URL
  const gscByUrl = new Map();
  const gscBySlug = new Map();
  for (const page of gscPages) {
    const pageUrl = (page.page || page.url || '').replace(/\/$/, '');
    if (!pageUrl) continue;

    const metrics = {
      clicks: page.clicks ?? 0,
      impressions: page.impressions ?? 0,
      ctr: page.ctr ?? 0,
      position: page.position ?? 0,
      gscUrl: pageUrl
    };

    gscByUrl.set(pageUrl, metrics);

    // Extract slug from URL path for cross-domain matching
    try {
      const urlPath = new URL(pageUrl).pathname.replace(/\/$/, '');
      const slug = urlPath.split('/').filter(Boolean).pop();
      if (slug) {
        // If multiple GSC pages match same slug, keep the one with most impressions
        const existing = gscBySlug.get(slug);
        if (!existing || metrics.impressions > existing.impressions) {
          gscBySlug.set(slug, metrics);
        }
      }
    } catch { /* ignore invalid URLs */ }
  }

  // 4. Cross-reference each post
  const articles = posts.map(post => {
    const url = (post.url || '').replace(/\/$/, '');
    const ageDays = daysSince(post.published_at);
    // Try exact URL match first, then slug match
    const gsc = gscByUrl.get(url) || gscBySlug.get(post.slug) || null;
    const hasGscData = gsc !== null;
    const impressions = gsc?.impressions ?? 0;
    const clicks = gsc?.clicks ?? 0;
    const ctr = gsc?.ctr ?? 0;
    const position = gsc?.position ?? 0;
    const status = classifyArticle(impressions, ageDays, hasGscData);

    return {
      id: post.id,
      title: post.title,
      slug: post.slug,
      url: post.url,
      published_at: post.published_at,
      ageDays,
      impressions,
      clicks,
      ctr,
      position,
      hasGscData,
      status
    };
  });

  console.log(`\n  Analysed ${articles.length} articles (GSC source: ${usingFallback ? 'local CSV' : 'API'})\n`);
  return articles;
}

// ── Reporting ──────────────────────────────────────────────────────────

/**
 * Print a formatted health report grouped by status.
 */
export function printHealthReport(articles) {
  if (!articles.length) {
    console.log('No articles to report.');
    return;
  }

  // Summary counts
  const counts = { 'too-new': 0, healthy: 0, underperforming: 0, dead: 0 };
  for (const a of articles) counts[a.status]++;

  console.log('╔══════════════════════════════════════════════╗');
  console.log('║           ARTICLE HEALTH REPORT             ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Healthy:          ${String(counts.healthy).padStart(4)}                     ║`);
  console.log(`║  Underperforming:  ${String(counts.underperforming).padStart(4)}                     ║`);
  console.log(`║  Dead:             ${String(counts.dead).padStart(4)}                     ║`);
  console.log(`║  Too New:          ${String(counts['too-new']).padStart(4)}                     ║`);
  console.log(`║  Total:            ${String(articles.length).padStart(4)}                     ║`);
  console.log('╚══════════════════════════════════════════════╝');

  // Dead articles - full details
  const dead = articles.filter(a => a.status === 'dead');
  if (dead.length) {
    console.log(`\n--- DEAD ARTICLES (${dead.length}) ---`);
    console.log('These articles have < 10 impressions in the last 28 days:\n');
    for (const a of dead) {
      console.log(`  Title:       ${a.title}`);
      console.log(`  URL:         ${a.url}`);
      console.log(`  Published:   ${a.published_at?.split('T')[0] || 'unknown'} (${a.ageDays} days ago)`);
      console.log(`  Impressions: ${a.impressions}`);
      console.log(`  Clicks:      ${a.clicks}`);
      console.log(`  CTR:         ${a.ctr.toFixed(2)}%`);
      console.log(`  Position:    ${a.position.toFixed(1)}`);
      console.log(`  GSC Data:    ${a.hasGscData ? 'yes' : 'no'}`);
      console.log('');
    }
  }

  // Underperforming articles - brief
  const underperforming = articles.filter(a => a.status === 'underperforming');
  if (underperforming.length) {
    console.log(`\n--- UNDERPERFORMING ARTICLES (${underperforming.length}) ---`);
    console.log('These articles have 10-49 impressions:\n');
    for (const a of underperforming) {
      console.log(`  [${a.impressions} imp] ${a.title}`);
    }
    console.log('');
  }

  // Top 5 healthy articles by impressions
  const healthy = articles
    .filter(a => a.status === 'healthy')
    .sort((a, b) => b.impressions - a.impressions);

  if (healthy.length) {
    console.log(`\n--- TOP 5 HEALTHY ARTICLES (of ${healthy.length}) ---\n`);
    for (const a of healthy.slice(0, 5)) {
      console.log(`  [${a.impressions} imp, ${a.clicks} clicks] ${a.title}`);
    }
    console.log('');
  }

  // Too-new count
  if (counts['too-new'] > 0) {
    console.log(`\n--- TOO NEW: ${counts['too-new']} articles younger than ${GRACE_PERIOD_DAYS} days (not evaluated) ---\n`);
  }
}

// ── Accessors ──────────────────────────────────────────────────────────

/**
 * Return only dead articles, optionally filtering by minimum age.
 */
export function getDeadArticles(articles, minAge = GRACE_PERIOD_DAYS) {
  return articles.filter(a => a.status === 'dead' && a.ageDays >= minAge);
}

// ── Actions ────────────────────────────────────────────────────────────

/**
 * Unpublish (draft) dead articles in Ghost and log them.
 */
export async function unpublishDeadArticles({ dryRun = false, minAge = GRACE_PERIOD_DAYS } = {}) {
  const articles = await getArticleHealth();
  const dead = getDeadArticles(articles, minAge);

  if (!dead.length) {
    console.log('\nNo dead articles found to unpublish.');
    return [];
  }

  console.log(`\nFound ${dead.length} dead article(s) to unpublish${dryRun ? ' (DRY RUN)' : ''}:\n`);

  const unpublished = [];

  for (const article of dead) {
    console.log(`  ${dryRun ? '[DRY RUN] Would unpublish' : 'Unpublishing'}: ${article.title}`);
    console.log(`    URL: ${article.url}`);
    console.log(`    Age: ${article.ageDays} days, Impressions: ${article.impressions}`);

    if (!dryRun) {
      try {
        await draftPost(article.id);
        console.log(`    -> Changed to draft`);
        unpublished.push({
          ...article,
          unpublishedAt: new Date().toISOString()
        });
      } catch (err) {
        console.error(`    -> Failed: ${err.message}`);
      }
    } else {
      unpublished.push(article);
    }
  }

  // Log unpublished articles to file
  if (!dryRun && unpublished.length) {
    const logPath = path.resolve(UNPUBLISHED_LOG);
    let existing = [];
    if (fs.existsSync(logPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
      } catch { /* ignore parse errors */ }
    }
    existing.push(...unpublished);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, JSON.stringify(existing, null, 2));
    console.log(`\n  Logged ${unpublished.length} unpublished articles to ${UNPUBLISHED_LOG}`);
  }

  console.log(`\nDone. ${unpublished.length} article(s) ${dryRun ? 'would be' : 'were'} unpublished.`);
  return unpublished;
}

/**
 * Rewrite dead articles with AI and update them in-place in Ghost,
 * keeping the same slug/URL for SEO continuity.
 */
export async function rewriteDeadArticles({ autoPost = false, limit = 5, minAge = GRACE_PERIOD_DAYS } = {}) {
  const articles = await getArticleHealth();
  const dead = getDeadArticles(articles, minAge);

  if (!dead.length) {
    console.log('\nNo dead articles found to rewrite.');
    return [];
  }

  const toRewrite = dead.slice(0, limit);
  console.log(`\nRewriting ${toRewrite.length} dead article(s) (limit: ${limit}):\n`);

  const results = [];

  for (const article of toRewrite) {
    console.log(`\n--- Rewriting: ${article.title} ---`);
    console.log(`  URL: ${article.url}`);
    console.log(`  Age: ${article.ageDays} days, Impressions: ${article.impressions}`);

    try {
      // Generate a new version of the article
      const topicInfo = {
        type: 'rewrite',
        topic: article.title,
        originalUrl: article.url,
        originalSlug: article.slug,
        query: article.title
      };

      const newArticle = await generateArticle('problem-solving', topicInfo);

      if (!newArticle || !newArticle.html) {
        console.error(`  Failed to generate rewrite for: ${article.title}`);
        continue;
      }

      // Update the Ghost post in-place (keep slug/URL)
      const updateData = {
        title: newArticle.title,
        html: newArticle.html,
        meta_title: newArticle.metaTitle || newArticle.title,
        meta_description: newArticle.metaDescription,
        custom_excerpt: newArticle.excerpt,
        status: autoPost ? 'published' : 'draft'
      };

      const updated = await updatePost(article.id, updateData);
      console.log(`  -> Updated in Ghost (status: ${updated.status})`);

      results.push({
        originalTitle: article.title,
        newTitle: newArticle.title,
        slug: article.slug,
        url: article.url,
        status: updated.status,
        rewrittenAt: new Date().toISOString()
      });
    } catch (err) {
      console.error(`  -> Rewrite failed: ${err.message}`);
    }
  }

  console.log(`\nDone. Rewrote ${results.length} of ${toRewrite.length} article(s).`);
  return results;
}
