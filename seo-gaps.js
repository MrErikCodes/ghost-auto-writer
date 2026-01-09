import { parse } from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';

// Parse the Search Console CSV files
export async function loadSearchConsoleData() {
  const queriesPath = path.join(config.searchConsolePath, 'Forspørsler.csv');
  const pagesPath = path.join(config.searchConsolePath, 'Sider.csv');

  const data = {
    queries: [],
    pages: []
  };

  // Load queries (Forspørsler.csv)
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

  // Load pages (Sider.csv)
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
