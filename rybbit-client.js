import fs from 'fs';
import path from 'path';
import { config } from './config.js';
import { formatDate } from './utils.js';

const BASE_URL = config.rybbitUrl;
const API_KEY = config.rybbitApiKey;
const SITE_ID = config.rybbitSiteId;
const CACHE_DIR = './data/rybbit-cache';

async function rybbitFetch(endpoint, params = {}) {
  if (!API_KEY) {
    throw new Error('RYBBIT_API_KEY not set in .env');
  }

  const url = new URL(`${BASE_URL}/api/sites/${SITE_ID}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${API_KEY}` }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Rybbit API error (${response.status}): ${body}`);
  }

  return response.json();
}

/**
 * Fetch site overview stats (sessions, pageviews, users, bounce rate, etc.)
 */
export async function fetchOverview(startDate, endDate) {
  const result = await rybbitFetch('/overview', {
    start_date: startDate,
    end_date: endDate,
    time_zone: 'Europe/Oslo'
  });
  return result.data;
}

/**
 * Fetch all pageview events and aggregate by pathname.
 * Returns a Map of pathname -> { pageviews, uniqueUsers }
 */
export async function fetchPageviews(startDate, endDate) {
  const pageMap = new Map();
  let page = 1;
  const pageSize = 500;
  let hasMore = true;

  while (hasMore) {
    const params = {
      start_date: startDate,
      end_date: endDate,
      time_zone: 'Europe/Oslo',
      page_size: String(pageSize),
      filters: JSON.stringify([
        { parameter: 'pathname', type: 'contains', value: ['/blog/'] }
      ])
    };

    // Use before_timestamp for pagination after first page
    if (page > 1 && pageMap._lastTimestamp) {
      params.before_timestamp = pageMap._lastTimestamp;
    }

    const result = await rybbitFetch('/events', params);
    const events = result.data || [];

    for (const event of events) {
      if (event.type !== 'pageview') continue;
      const pathname = event.pathname;
      if (!pathname) continue;

      const existing = pageMap.get(pathname);
      if (existing) {
        existing.pageviews++;
        existing.users.add(event.user_id);
      } else {
        pageMap.set(pathname, {
          pageviews: 1,
          users: new Set([event.user_id])
        });
      }
    }

    // Track last timestamp for cursor pagination
    if (events.length > 0) {
      pageMap._lastTimestamp = events[events.length - 1].timestamp;
    }

    hasMore = result.cursor?.hasMore || (result.pagination && page < result.pagination.totalPages);
    page++;

    // Safety limit
    if (page > 100) break;
  }

  // Convert Sets to counts and clean up
  delete pageMap._lastTimestamp;
  const aggregated = {};
  for (const [pathname, data] of pageMap) {
    aggregated[pathname] = {
      pageviews: data.pageviews,
      uniqueUsers: data.users.size
    };
  }

  return aggregated;
}

/**
 * Get per-page analytics with daily caching.
 * Returns { pathname: { pageviews, uniqueUsers } }
 */
export async function getPageviewsCached(startDate, endDate) {
  const today = formatDate(new Date());
  const cacheFile = path.join(CACHE_DIR, `${today}.json`);

  // Check today's cache
  if (fs.existsSync(cacheFile)) {
    console.log(`  Using cached Rybbit data from ${today}`);
    return JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
  }

  // Fetch from API
  console.log('  Fetching pageviews from Rybbit API...');
  const data = await fetchPageviews(startDate, endDate);

  // Cache it
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2));

  const pageCount = Object.keys(data).length;
  const totalViews = Object.values(data).reduce((sum, d) => sum + d.pageviews, 0);
  console.log(`  Cached ${pageCount} pages (${totalViews} total pageviews) to ${today}.json`);

  return data;
}
