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

// Extract slug (last path segment) from a URL path or full URL
export function extractSlug(urlOrPath) {
  let pathname = urlOrPath;
  try { pathname = new URL(urlOrPath).pathname; } catch { /* already a path */ }
  return pathname.replace(/\/$/, '').split('/').filter(Boolean).pop() || '';
}

// Normalize GSC metric values (ctr decimal→percentage, position rounding)
export function normalizeGscMetrics(row) {
  return {
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: Math.round(row.ctr * 10000) / 100,
    position: Math.round(row.position * 100) / 100,
  };
}
