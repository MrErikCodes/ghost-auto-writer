import { config } from './config.js';
import { submitSitemap } from './search-console-client.js';

const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
const BATCH_SIZE = 500;

/**
 * Parse a sitemap XML and extract all <loc> URLs.
 */
async function parseSitemap(sitemapUrl) {
  const response = await fetch(sitemapUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch sitemap (${response.status}): ${sitemapUrl}`);
  }

  const xml = await response.text();
  const urls = [];

  // Extract all <loc> tags - handles both sitemap index and regular sitemaps
  const locMatches = xml.matchAll(/<loc>\s*(.*?)\s*<\/loc>/g);
  for (const match of locMatches) {
    urls.push(match[1].trim());
  }

  return urls;
}

/**
 * Resolve a sitemap index into individual page URLs.
 * If the sitemap contains links to other sitemaps, fetches those too.
 */
async function resolveAllUrls(sitemapUrl) {
  console.log(`  Fetching sitemap: ${sitemapUrl}`);
  const urls = await parseSitemap(sitemapUrl);

  // Check if this is a sitemap index (urls point to other .xml files)
  const childSitemaps = urls.filter(u => u.endsWith('.xml'));
  const pageUrls = urls.filter(u => !u.endsWith('.xml'));

  if (childSitemaps.length > 0) {
    console.log(`  Found sitemap index with ${childSitemaps.length} child sitemaps`);
    for (const child of childSitemaps) {
      console.log(`  Fetching child sitemap: ${child}`);
      const childUrls = await parseSitemap(child);
      pageUrls.push(...childUrls.filter(u => !u.endsWith('.xml')));
    }
  }

  return pageUrls;
}

/**
 * Submit URLs to IndexNow (Bing, Yandex, Naver, Seznam, etc.).
 * Batches into groups of BATCH_SIZE to avoid rate limits.
 */
export async function submitToIndexNow(urls) {
  const apiKey = config.indexNowKey;
  if (!apiKey) {
    throw new Error('INDEXNOW_KEY not set in .env');
  }

  const host = new URL(config.siteUrl).host;
  console.log(`\n  Submitting ${urls.length} URLs to IndexNow (${host})...`);

  let submitted = 0;
  let failed = 0;

  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(urls.length / BATCH_SIZE);

    const payload = {
      host,
      key: apiKey,
      keyLocation: `${config.siteUrl}/${apiKey}.txt`,
      urlList: batch,
    };

    try {
      const response = await fetch(INDEXNOW_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload),
      });

      if (response.ok || response.status === 202) {
        submitted += batch.length;
        console.log(`  Batch ${batchNum}/${totalBatches}: ${batch.length} URLs submitted (${response.status})`);
      } else {
        const body = await response.text();
        failed += batch.length;
        console.error(`  Batch ${batchNum}/${totalBatches}: Failed (${response.status}): ${body}`);
      }
    } catch (err) {
      failed += batch.length;
      console.error(`  Batch ${batchNum}/${totalBatches}: Error: ${err.message}`);
    }
  }

  return { submitted, failed };
}

/**
 * Submit sitemap to Google via Search Console API.
 */
export async function submitToGoogle(sitemapUrl) {
  console.log(`\n  Submitting sitemap to Google Search Console: ${sitemapUrl}`);

  try {
    await submitSitemap(config.gscSiteUrl, sitemapUrl);
    console.log(`  Google: Sitemap submitted successfully`);
    return true;
  } catch (err) {
    console.error(`  Google: Failed to submit sitemap: ${err.message}`);
    return false;
  }
}

/**
 * Submit all URLs from a sitemap to IndexNow + submit sitemap to Google.
 */
export async function indexSitemap(sitemapUrl) {
  console.log(`\n=== IndexNow: Submit Sitemap ===\n`);

  // 1. Fetch and resolve all URLs from sitemap
  const urls = await resolveAllUrls(sitemapUrl);
  console.log(`\n  Found ${urls.length} total URLs in sitemap`);

  if (!urls.length) {
    console.log('  No URLs found in sitemap. Nothing to submit.');
    return;
  }

  // 2. Submit to IndexNow (Bing, Yandex, etc.)
  const { submitted, failed } = await submitToIndexNow(urls);

  // 3. Submit sitemap to Google via Search Console API
  const googleOk = await submitToGoogle(sitemapUrl);

  // Summary
  console.log('\n  ╔═══════════════════════════════════╗');
  console.log('  ║       INDEXING SUMMARY             ║');
  console.log('  ╠═══════════════════════════════════╣');
  console.log(`  ║  Total URLs:      ${String(urls.length).padStart(6)}          ║`);
  console.log(`  ║  IndexNow sent:   ${String(submitted).padStart(6)}          ║`);
  console.log(`  ║  IndexNow failed: ${String(failed).padStart(6)}          ║`);
  console.log(`  ║  Google sitemap:  ${googleOk ? '    OK' : 'FAILED'}          ║`);
  console.log('  ╚═══════════════════════════════════╝');

  return { urls: urls.length, submitted, failed, googleSubmit: googleOk };
}

/**
 * Submit specific URLs to IndexNow (e.g., after publishing a new post).
 */
export async function indexUrls(urls) {
  if (!urls.length) return { submitted: 0, failed: 0 };

  const { submitted, failed } = await submitToIndexNow(urls);
  console.log(`\n  IndexNow: ${submitted} submitted, ${failed} failed`);
  return { submitted, failed };
}
