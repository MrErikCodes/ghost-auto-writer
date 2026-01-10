import { parse } from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';

// Get all date folders from searchconsole directory (yyyy-mm-dd format)
function getDateFolders() {
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
    .sort((a, b) => b.date - a.date); // Newest first
}

// Calculate weight based on recency (exponential decay)
// Newest data gets weight 1.0, older data decays but never goes below 0.1
function calculateRecencyWeight(dateStr, newestDateStr) {
  const date = new Date(dateStr);
  const newestDate = new Date(newestDateStr);
  const daysDiff = (newestDate - date) / (1000 * 60 * 60 * 24);

  // Exponential decay: half-life of 14 days, minimum weight 0.1
  const halfLife = 14;
  const weight = Math.pow(0.5, daysDiff / halfLife);
  return Math.max(weight, 0.1);
}

// Load CSV data from a specific folder
function loadFolderData(folderPath) {
  const queriesPath = path.join(folderPath, 'Forspørsler.csv');
  const pagesPath = path.join(folderPath, 'Sider.csv');

  const data = { queries: [], pages: [] };

  if (fs.existsSync(queriesPath)) {
    const content = fs.readFileSync(queriesPath, 'utf-8');
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

  if (fs.existsSync(pagesPath)) {
    const content = fs.readFileSync(pagesPath, 'utf-8');
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

  return data;
}

// Parse the Search Console CSV files with date-based weighting
export async function loadSearchConsoleData() {
  const dateFolders = getDateFolders();

  // If no date folders, fall back to flat structure (backward compatibility)
  if (dateFolders.length === 0) {
    console.log('  → Search Console: Bruker flat mappestruktur (ingen datoer)');
    const data = loadFolderData(config.searchConsolePath);
    console.log(`  ✓ Search Console: ${data.queries.length} søk, ${data.pages.length} sider`);
    return data;
  }

  const newestDate = dateFolders[0].name;
  const oldestDate = dateFolders[dateFolders.length - 1].name;
  console.log(`  → Search Console: ${dateFolders.length} datoperioder funnet (${oldestDate} til ${newestDate})`);
  dateFolders.forEach(f => {
    const weight = calculateRecencyWeight(f.name, newestDate);
    console.log(`    • ${f.name} (vekt: ${(weight * 100).toFixed(0)}%)`);
  });
  const queryMap = new Map(); // Aggregate queries by query text
  const pageMap = new Map();  // Aggregate pages by page URL

  for (const folder of dateFolders) {
    const weight = calculateRecencyWeight(folder.name, newestDate);
    const folderData = loadFolderData(folder.path);

    // Aggregate queries with weighting
    for (const q of folderData.queries) {
      const key = q.query?.toLowerCase();
      if (!key) continue;

      if (queryMap.has(key)) {
        const existing = queryMap.get(key);
        existing.weightedClicks += q.clicks * weight;
        existing.weightedImpressions += q.impressions * weight;
        existing.totalWeight += weight;
        existing.sources.push({ date: folder.name, weight, ...q });
      } else {
        queryMap.set(key, {
          query: q.query,
          weightedClicks: q.clicks * weight,
          weightedImpressions: q.impressions * weight,
          weightedPosition: q.position * weight,
          weightedCtr: q.ctr * weight,
          totalWeight: weight,
          sources: [{ date: folder.name, weight, ...q }]
        });
      }
    }

    // Aggregate pages with weighting
    for (const p of folderData.pages) {
      const key = p.page?.toLowerCase();
      if (!key) continue;

      if (pageMap.has(key)) {
        const existing = pageMap.get(key);
        existing.weightedClicks += p.clicks * weight;
        existing.weightedImpressions += p.impressions * weight;
        existing.totalWeight += weight;
        existing.sources.push({ date: folder.name, weight, ...p });
      } else {
        pageMap.set(key, {
          page: p.page,
          weightedClicks: p.clicks * weight,
          weightedImpressions: p.impressions * weight,
          weightedPosition: p.position * weight,
          weightedCtr: p.ctr * weight,
          totalWeight: weight,
          sources: [{ date: folder.name, weight, ...p }]
        });
      }
    }
  }

  // Convert maps to arrays with normalized weighted values
  const queries = Array.from(queryMap.values()).map(q => ({
    query: q.query,
    clicks: Math.round(q.weightedClicks / q.totalWeight),
    impressions: Math.round(q.weightedImpressions / q.totalWeight),
    ctr: q.weightedCtr / q.totalWeight,
    position: q.weightedPosition / q.totalWeight,
    dataPoints: q.sources.length,
    newestData: q.sources[0]?.date
  }));

  const pages = Array.from(pageMap.values()).map(p => ({
    page: p.page,
    clicks: Math.round(p.weightedClicks / p.totalWeight),
    impressions: Math.round(p.weightedImpressions / p.totalWeight),
    ctr: p.weightedCtr / p.totalWeight,
    position: p.weightedPosition / p.totalWeight,
    dataPoints: p.sources.length,
    newestData: p.sources[0]?.date
  }));

  console.log(`  ✓ Search Console: ${queries.length} søk, ${pages.length} sider (vektet)`);
  return { queries, pages };
}

// Find SEO gap opportunities: high impressions, low clicks
export async function findSeoGaps(minImpressions = 50, maxCtr = 2) {
  const data = await loadSearchConsoleData();

  // Filter for opportunity keywords
  const gaps = data.queries.filter(q =>
    q.impressions >= minImpressions &&
    q.ctr <= maxCtr &&
    q.clicks <= 5 // Low clicks means we're not capturing this traffic
  );

  // Score the opportunities
  const scored = gaps.map(q => ({
    ...q,
    opportunityScore: q.impressions * (1 - q.ctr / 100) * (10 / Math.max(q.position, 1))
  }));

  // Sort by opportunity score
  return scored.sort((a, b) => b.opportunityScore - a.opportunityScore);
}

// Get next SEO gap topic to write about
export async function getNextSeoGapTopic(excludeTopics = []) {
  const gaps = await findSeoGaps();

  // Filter out already used queries
  const available = gaps.filter(g =>
    !excludeTopics.some(e =>
      e.query?.toLowerCase() === g.query?.toLowerCase() ||
      e.title?.toLowerCase().includes(g.query?.toLowerCase())
    )
  );

  if (available.length === 0) {
    return null;
  }

  const gap = available[0];
  return {
    type: 'seo-gap',
    query: gap.query,
    impressions: gap.impressions,
    clicks: gap.clicks,
    position: gap.position,
    opportunityScore: gap.opportunityScore
  };
}

// Find keywords related to a specific store
export function findStoreKeywords(storeName) {
  return async () => {
    const data = await loadSearchConsoleData();
    const storeKeywords = data.queries.filter(q =>
      q.query.toLowerCase().includes(storeName.toLowerCase())
    );
    return storeKeywords.sort((a, b) => b.impressions - a.impressions);
  };
}

// Get top performing content to understand what works
export async function getTopPerformers(limit = 10) {
  const data = await loadSearchConsoleData();

  return data.queries
    .filter(q => q.clicks > 0)
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, limit);
}
