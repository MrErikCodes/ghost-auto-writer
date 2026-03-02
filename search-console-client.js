import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';
import { formatDate, getGscDateRange } from './utils.js';

/**
 * Authenticate with Google using a service account JSON key.
 * Returns an authenticated GoogleAuth client.
 */
async function getAuthClient() {
  const keyPath = config.gscServiceAccountPath;

  if (!fs.existsSync(keyPath)) {
    throw new Error(
      `Google service account key not found at: ${keyPath}\n\n` +
      `Setup instructions:\n` +
      `1. Go to Google Cloud Console (https://console.cloud.google.com)\n` +
      `2. Create a service account with Search Console API access\n` +
      `3. Download the JSON key file\n` +
      `4. Save it as: ${keyPath}\n` +
      `5. Add the service account email as a user in Google Search Console\n` +
      `   (Settings > Users and permissions > Add user > select "Full" permission)`
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: keyPath,
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
  });

  return auth;
}

// formatDate and getGscDateRange are imported from utils.js

/**
 * Fetch query-level data from Search Console.
 */
async function fetchQueryData(siteUrl, startDate, endDate, rowLimit = 5000) {
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

  const rows = response.data.rows || [];
  return rows.map(row => ({
    query: row.keys[0],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: Math.round(row.ctr * 10000) / 100,
    position: Math.round(row.position * 100) / 100,
  }));
}

/**
 * Fetch page-level data from Search Console.
 */
async function fetchPageData(siteUrl, startDate, endDate, rowLimit = 5000) {
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

  const rows = response.data.rows || [];
  return rows.map(row => ({
    page: row.keys[0],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: Math.round(row.ctr * 10000) / 100,
    position: Math.round(row.position * 100) / 100,
  }));
}

/**
 * Fetch device-level data from Search Console.
 */
async function fetchDeviceData(siteUrl, startDate, endDate) {
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

  const rows = response.data.rows || [];
  return rows.map(row => ({
    device: row.keys[0],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: Math.round(row.ctr * 10000) / 100,
    position: Math.round(row.position * 100) / 100,
  }));
}

/**
 * Fetch country-level data from Search Console.
 */
async function fetchCountryData(siteUrl, startDate, endDate) {
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

  const rows = response.data.rows || [];
  return rows.map(row => ({
    country: row.keys[0],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: Math.round(row.ctr * 10000) / 100,
    position: Math.round(row.position * 100) / 100,
  }));
}

/**
 * Fetch daily data from Search Console.
 */
async function fetchDailyData(siteUrl, startDate, endDate) {
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

  const rows = response.data.rows || [];
  return rows.map(row => ({
    date: row.keys[0],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: Math.round(row.ctr * 10000) / 100,
    position: Math.round(row.position * 100) / 100,
  }));
}

/**
 * Fetch all Search Console data and save to searchconsole/YYYY-MM-DD/ as JSON files.
 */
async function fetchAll(options = {}) {
  const siteUrl = options.siteUrl || config.gscSiteUrl;
  const { startDate, endDate } = options.startDate && options.endDate
    ? { startDate: options.startDate, endDate: options.endDate }
    : getGscDateRange();

  console.log(`  Site: ${siteUrl}`);
  console.log(`  Period: ${startDate} to ${endDate}\n`);

  // Fetch all data types
  console.log('  Fetching queries...');
  const queries = await fetchQueryData(siteUrl, startDate, endDate);
  console.log(`    ${queries.length} queries`);

  console.log('  Fetching pages...');
  const pages = await fetchPageData(siteUrl, startDate, endDate);
  console.log(`    ${pages.length} pages`);

  console.log('  Fetching devices...');
  const devices = await fetchDeviceData(siteUrl, startDate, endDate);
  console.log(`    ${devices.length} device types`);

  console.log('  Fetching countries...');
  const countries = await fetchCountryData(siteUrl, startDate, endDate);
  console.log(`    ${countries.length} countries`);

  console.log('  Fetching daily data...');
  const daily = await fetchDailyData(siteUrl, startDate, endDate);
  console.log(`    ${daily.length} days`);

  // Save to searchconsole/YYYY-MM-DD/
  const today = formatDate(new Date());
  const outputDir = path.join(config.searchConsolePath, today);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const metadata = {
    fetchedAt: new Date().toISOString(),
    siteUrl,
    startDate,
    endDate,
    counts: {
      queries: queries.length,
      pages: pages.length,
      devices: devices.length,
      countries: countries.length,
      daily: daily.length,
    },
  };

  fs.writeFileSync(path.join(outputDir, 'queries.json'), JSON.stringify(queries, null, 2));
  fs.writeFileSync(path.join(outputDir, 'pages.json'), JSON.stringify(pages, null, 2));
  fs.writeFileSync(path.join(outputDir, 'devices.json'), JSON.stringify(devices, null, 2));
  fs.writeFileSync(path.join(outputDir, 'countries.json'), JSON.stringify(countries, null, 2));
  fs.writeFileSync(path.join(outputDir, 'daily.json'), JSON.stringify(daily, null, 2));
  fs.writeFileSync(path.join(outputDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

  console.log(`\n  Saved to: ${outputDir}/`);
  console.log(`  Files: queries.json, pages.json, devices.json, countries.json, daily.json, metadata.json`);

  // Print summary
  console.log('\n  Summary:');
  console.log(`    Queries: ${queries.length}`);
  console.log(`    Pages: ${pages.length}`);
  console.log(`    Devices: ${devices.length}`);
  console.log(`    Countries: ${countries.length}`);
  console.log(`    Daily data points: ${daily.length}`);

  if (queries.length > 0) {
    const topQuery = queries.sort((a, b) => b.clicks - a.clicks)[0];
    console.log(`\n  Top query: "${topQuery.query}" (${topQuery.clicks} clicks, ${topQuery.impressions} impressions)`);
  }

  if (pages.length > 0) {
    const topPage = pages.sort((a, b) => b.clicks - a.clicks)[0];
    console.log(`  Top page: ${topPage.page} (${topPage.clicks} clicks)`);
  }

  return { queries, pages, devices, countries, daily, metadata };
}

/**
 * Get page performance data (alias for fetchPageData, used by article-health.js).
 */
async function getPagePerformance(siteUrl, startDate, endDate) {
  return fetchPageData(siteUrl, startDate, endDate);
}

export {
  getAuthClient,
  fetchQueryData,
  fetchPageData,
  fetchDeviceData,
  fetchCountryData,
  fetchDailyData,
  fetchAll,
  getPagePerformance,
};
