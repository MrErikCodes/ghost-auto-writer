import fs from 'fs';
import path from 'path';
import { config } from './config.js';
import { getGscDateRange, getSearchConsoleDateFolders, formatDate } from './utils.js';
import { getAllPostsWithContent, updatePost, draftPost } from './ghost-client.js';
import { getPagePerformance } from './search-console-client.js';
import { getPageviewsCached } from './rybbit-client.js';
import { generateArticle } from './article-writer.js';

const UNPUBLISHED_LOG = './data/unpublished-articles.json';
const GRACE_PERIOD_DAYS = 60;
const THRESHOLDS = { healthy: 50, underperforming: 10 };
const PUBLIC_BLOG_URL = 'https://minekvitteringer.no/blog';

// ── Helpers ────────────────────────────────────────────────────────────

function daysSince(dateStr) {
  return Math.floor((new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24));
}

function classifyArticle(impressions, ageDays, hasGscData) {
  if (ageDays < GRACE_PERIOD_DAYS) return 'too-new';
  if (!hasGscData) return 'dead';
  if (impressions >= THRESHOLDS.healthy) return 'healthy';
  if (impressions >= THRESHOLDS.underperforming) return 'underperforming';
  return 'dead';
}

function publicUrl(slug) {
  return `${PUBLIC_BLOG_URL}/${slug}`;
}

// ── Cached GSC Data ──────────────────────────────────────────────────

/**
 * Load cached GSC page data from today's folder, or fetch from API if not cached.
 * Only fetches once per day.
 */
async function getGscPageDataCached() {
  const today = formatDate(new Date());
  const todayDir = path.join(config.searchConsolePath, today);
  const cachedPath = path.join(todayDir, 'pages.json');

  // Check if today's data already exists
  if (fs.existsSync(cachedPath)) {
    console.log(`  Using cached GSC data from ${today}/pages.json`);
    return JSON.parse(fs.readFileSync(cachedPath, 'utf-8'));
  }

  // Try loading from most recent cached folder
  const dateFolders = getSearchConsoleDateFolders();
  for (const folder of dateFolders) {
    const jsonPath = path.join(folder.path, 'pages.json');
    if (fs.existsSync(jsonPath)) {
      console.log(`  Using cached GSC data from ${folder.name}/pages.json (run 'fetch-gsc' to update)`);
      return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    }
  }

  // No cache at all - fetch from API
  console.log('  No cached GSC data found, fetching from API...');
  const { startDate, endDate } = getGscDateRange();
  const pages = await getPagePerformance(config.gscSiteUrl, startDate, endDate);

  // Cache the result
  if (!fs.existsSync(todayDir)) {
    fs.mkdirSync(todayDir, { recursive: true });
  }
  fs.writeFileSync(cachedPath, JSON.stringify(pages, null, 2));
  console.log(`  Cached ${pages.length} pages to ${today}/pages.json`);

  return pages;
}

// ── Core: Article Health ───────────────────────────────────────────────

export async function getArticleHealth() {
  console.log('\n=== Article Health Check ===\n');

  // 1. Fetch all published posts from Ghost
  console.log('Fetching published posts from Ghost...');
  const posts = await getAllPostsWithContent();
  if (!posts.length) {
    console.error('No posts found in Ghost. Aborting health check.');
    return [];
  }

  // 2. Get GSC page data (cached, only fetches once per day)
  console.log('Loading GSC page data...');
  let gscPages = [];
  try {
    gscPages = await getGscPageDataCached();
    console.log(`  Got ${gscPages.length} pages`);
  } catch (err) {
    console.warn(`  GSC data unavailable: ${err.message}`);
    console.warn('  Run "node index.js fetch-gsc" first to fetch data.');
  }

  // 2b. Get Rybbit pageview data (cached, only fetches once per day)
  console.log('Loading Rybbit pageview data...');
  let rybbitData = {};
  try {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 28);
    rybbitData = await getPageviewsCached(formatDate(start), formatDate(end));
    const pageCount = Object.keys(rybbitData).length;
    console.log(`  Got ${pageCount} pages with pageviews`);
  } catch (err) {
    console.warn(`  Rybbit data unavailable: ${err.message}`);
  }

  // 2c. Build Rybbit lookup by slug
  const rybbitBySlug = new Map();
  for (const [pathname, data] of Object.entries(rybbitData)) {
    const slug = pathname.replace(/\/$/, '').split('/').filter(Boolean).pop();
    if (slug) {
      rybbitBySlug.set(slug, data);
    }
  }

  // 3. Build lookup maps (match by slug since Ghost and GSC use different domains)
  const gscBySlug = new Map();
  for (const page of gscPages) {
    const pageUrl = (page.page || '').replace(/\/$/, '');
    if (!pageUrl) continue;

    const metrics = {
      clicks: page.clicks ?? 0,
      impressions: page.impressions ?? 0,
      ctr: page.ctr ?? 0,
      position: page.position ?? 0,
      gscUrl: pageUrl
    };

    try {
      const urlPath = new URL(pageUrl).pathname.replace(/\/$/, '');
      const slug = urlPath.split('/').filter(Boolean).pop();
      if (slug) {
        const existing = gscBySlug.get(slug);
        if (!existing || metrics.impressions > existing.impressions) {
          gscBySlug.set(slug, metrics);
        }
      }
    } catch { /* ignore invalid URLs */ }
  }

  // 4. Cross-reference each post
  const articles = posts.map(post => {
    const ageDays = daysSince(post.published_at);
    const gsc = gscBySlug.get(post.slug) || null;
    const rybbit = rybbitBySlug.get(post.slug) || null;
    const hasGscData = gsc !== null;
    const impressions = gsc?.impressions ?? 0;
    const clicks = gsc?.clicks ?? 0;
    const ctr = gsc?.ctr ?? 0;
    const position = gsc?.position ?? 0;
    const pageviews = rybbit?.pageviews ?? 0;
    const uniqueUsers = rybbit?.uniqueUsers ?? 0;
    const status = classifyArticle(impressions, ageDays, hasGscData);

    return {
      id: post.id,
      title: post.title,
      slug: post.slug,
      url: publicUrl(post.slug),
      published_at: post.published_at,
      ageDays,
      impressions,
      clicks,
      ctr,
      position,
      hasGscData,
      pageviews,
      uniqueUsers,
      status
    };
  });

  console.log(`\n  Analysed ${articles.length} articles\n`);
  return articles;
}

// ── Reporting ──────────────────────────────────────────────────────────

export function printHealthReport(articles) {
  if (!articles.length) {
    console.log('No articles to report.');
    return;
  }

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
    console.log('< 10 impressions in the last 28 days:\n');
    for (const a of dead) {
      console.log(`  ${a.title}`);
      console.log(`    ${a.url}`);
      console.log(`    Published: ${a.published_at?.split('T')[0]} (${a.ageDays} days ago)`);
      console.log(`    GSC: ${a.impressions} imp | ${a.clicks} clicks | CTR: ${a.ctr.toFixed(2)}% | Pos: ${a.position.toFixed(1)}`);
      console.log(`    Rybbit: ${a.pageviews} pageviews | ${a.uniqueUsers} unique users`);
      console.log(`    GSC data: ${a.hasGscData ? 'yes' : 'no (not indexed?)'}`);
      console.log('');
    }
  }

  // Underperforming
  const underperforming = articles.filter(a => a.status === 'underperforming');
  if (underperforming.length) {
    console.log(`\n--- UNDERPERFORMING ARTICLES (${underperforming.length}) ---`);
    console.log('10-49 impressions:\n');
    for (const a of underperforming) {
      console.log(`  [${a.impressions} imp | ${a.pageviews} views] ${a.title}`);
    }
    console.log('');
  }

  // Top 5 healthy
  const healthy = articles
    .filter(a => a.status === 'healthy')
    .sort((a, b) => b.impressions - a.impressions);

  if (healthy.length) {
    console.log(`\n--- TOP 5 HEALTHY ARTICLES (of ${healthy.length}) ---\n`);
    for (const a of healthy.slice(0, 5)) {
      console.log(`  [${a.impressions} imp, ${a.clicks} clicks, ${a.pageviews} views] ${a.title}`);
    }
    console.log('');
  }

  if (counts['too-new'] > 0) {
    console.log(`--- TOO NEW: ${counts['too-new']} articles < ${GRACE_PERIOD_DAYS} days old (skipped) ---\n`);
  }
}

// ── Accessors ──────────────────────────────────────────────────────────

export function getDeadArticles(articles, minAge = GRACE_PERIOD_DAYS) {
  return articles.filter(a => a.status === 'dead' && a.ageDays >= minAge);
}

// ── Actions ────────────────────────────────────────────────────────────

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
    console.log(`    ${article.url}`);
    console.log(`    Age: ${article.ageDays} days, Impressions: ${article.impressions}`);

    if (!dryRun) {
      try {
        await draftPost(article.id);
        console.log(`    -> Changed to draft`);
        unpublished.push({ ...article, unpublishedAt: new Date().toISOString() });
      } catch (err) {
        console.error(`    -> Failed: ${err.message}`);
      }
    } else {
      unpublished.push(article);
    }
  }

  // Log unpublished articles
  if (!dryRun && unpublished.length) {
    const logPath = path.resolve(UNPUBLISHED_LOG);
    let existing = [];
    if (fs.existsSync(logPath)) {
      try { existing = JSON.parse(fs.readFileSync(logPath, 'utf-8')); } catch { /* */ }
    }
    existing.push(...unpublished);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, JSON.stringify(existing, null, 2));
    console.log(`\n  Logged ${unpublished.length} unpublished articles to ${UNPUBLISHED_LOG}`);
  }

  console.log(`\nDone. ${unpublished.length} article(s) ${dryRun ? 'would be' : 'were'} unpublished.`);
  return unpublished;
}

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
    console.log(`  ${article.url}`);
    console.log(`  Age: ${article.ageDays} days, Impressions: ${article.impressions}`);

    try {
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
