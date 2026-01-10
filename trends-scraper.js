import puppeteer from 'puppeteer';
import RSSParser from 'rss-parser';
import fs from 'fs';
import { config } from './config.js';

const TRENDS_FOLDER = './trends';

// Scrape Google Trends Norway page for ALL trending topics
export async function scrapeGoogleTrendsNorway(debug = false) {
  console.log('🔍 Scraping Google Trends Norge...');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // Set Norwegian locale
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'no-NO,no;q=0.9,en;q=0.8'
    });

    // Go to Google Trends Norway
    const url = 'https://trends.google.com/trending?geo=NO&hl=no';
    console.log(`  → Navigating to ${url}`);

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait for table to load
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Try to change rows per page to 100 for more results
    try {
      // Click the rows per page dropdown
      const rowsDropdown = await page.$('div[aria-label*="Rader per side"], .mdc-select, [class*="rows-per-page"]');
      if (rowsDropdown) {
        await rowsDropdown.click();
        await new Promise(resolve => setTimeout(resolve, 500));
        // Click on 100 option
        const option100 = await page.$('li[data-value="100"], [role="option"]:last-child');
        if (option100) {
          await option100.click();
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } catch (e) {
      console.log('  ℹ Could not change rows per page, using default');
    }

    const allTrends = [];
    const seenTitles = new Set();
    let pageNum = 1;
    let hasMorePages = true;

    while (hasMorePages && pageNum <= 10) { // Max 10 pages to avoid infinite loops
      console.log(`  → Scraping page ${pageNum}...`);

      // Extract trends from current page
      const pageTrends = await page.evaluate(() => {
        const items = [];

        // Get all table rows
        const rows = document.querySelectorAll('table tbody tr');

        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 2) {
            // The trend name is in the second cell (first is checkbox)
            // Look for the cell that contains just the trend name
            let trendName = '';
            let traffic = '';

            // Cell 0 is usually checkbox, cell 1 has the trend name
            // The trend name cell might have nested elements
            const nameCell = cells[1];
            if (nameCell) {
              // Try to get just the main text, not nested elements
              const nameSpan = nameCell.querySelector('span') || nameCell.querySelector('a') || nameCell;
              // Get the first line of text only
              const fullText = nameSpan.textContent?.trim() || '';
              // Split by common separators and take first part
              trendName = fullText.split(/[\n·•|]/)[0].trim();
              // Remove any trailing numbers/percentage
              trendName = trendName.replace(/\d+[k+]?\+?\s*(søk)?\.?$/i, '').trim();
            }

            // Cell 2 usually has the search volume
            if (cells[2]) {
              const trafficText = cells[2].textContent?.trim();
              const trafficMatch = trafficText?.match(/^(\d+[k+]?\+?)/i);
              if (trafficMatch) {
                traffic = trafficMatch[1];
              }
            }

            if (trendName && trendName.length > 1 && trendName.length < 100) {
              items.push({
                title: trendName,
                traffic: traffic || 'Trending',
                source: 'google-trends-scrape'
              });
            }
          }
        });

        return items;
      });

      // Add unique trends
      for (const trend of pageTrends) {
        const key = trend.title.toLowerCase();
        if (!seenTitles.has(key)) {
          seenTitles.add(key);
          allTrends.push(trend);
        }
      }

      console.log(`  → Found ${pageTrends.length} trends on page ${pageNum} (total unique: ${allTrends.length})`);

      // Check for next page button and click it
      try {
        // Find and click the "neste side" (next page) button
        const clicked = await page.evaluate(() => {
          // Look for button with aria-label containing "neste side"
          const nextBtn = document.querySelector('button[aria-label*="neste side"]');
          if (nextBtn && !nextBtn.disabled && nextBtn.getAttribute('aria-disabled') !== 'true') {
            nextBtn.click();
            return true;
          }
          return false;
        });

        if (clicked) {
          await new Promise(resolve => setTimeout(resolve, 1500));
          pageNum++;
        } else {
          hasMorePages = false;
        }
      } catch (e) {
        hasMorePages = false;
      }
    }

    if (debug) {
      await page.screenshot({ path: './trends/debug-screenshot.png', fullPage: true });
      console.log('  📸 Saved debug screenshot');
      const html = await page.content();
      fs.writeFileSync('./trends/debug-page.html', html);
      console.log('  📄 Saved debug HTML');
    }

    console.log(`  ✓ Scraped ${allTrends.length} total trends from Google Trends Norge`);
    return allTrends;

  } catch (error) {
    console.error(`  ⚠ Google Trends scraping failed: ${error.message}`);
    return [];
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Auto-scroll to load lazy-loaded content
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 500;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight || totalHeight > 10000) {
          clearInterval(timer);
          resolve();
        }
      }, 200);
    });
  });

  // Wait a bit for content to load after scrolling
  await new Promise(resolve => setTimeout(resolve, 1000));
}

// Fetch news from all configured RSS feeds
export async function fetchAllRSSFeeds() {
  console.log('📰 Fetching Norwegian news from RSS feeds...');

  const parser = new RSSParser();
  const feeds = config.rssFeeds || [];

  const allItems = [];
  const seenTitles = new Set();

  for (const feed of feeds) {
    try {
      const feedData = await parser.parseURL(feed.url);

      if (feedData.items) {
        for (const item of feedData.items) {
          const title = item.title?.trim();
          const titleLower = title?.toLowerCase();

          if (title && !seenTitles.has(titleLower)) {
            seenTitles.add(titleLower);
            allItems.push({
              title: title,
              link: item.link,
              pubDate: item.pubDate,
              description: item.contentSnippet || item.description,
              categories: item.categories || [],
              source: feed.name
            });
          }
        }
        console.log(`  ✓ ${feed.name}: ${feedData.items.length} items`);
      }
    } catch (error) {
      console.log(`  ⚠ ${feed.name}: ${error.message}`);
    }
  }

  console.log(`  ✓ Total ${allItems.length} unique news items from RSS feeds`);
  return allItems;
}

// Combine all trend sources (90% Google Trends, 10% RSS feeds)
export async function fetchAllTrends(debug = false) {
  console.log('\n📊 Fetching trends from all sources...\n');

  const [googleTrends, rssNews] = await Promise.all([
    scrapeGoogleTrendsNorway(debug),
    fetchAllRSSFeeds()
  ]);

  const today = new Date().toISOString().split('T')[0];

  // Create trends folder if needed
  if (!fs.existsSync(TRENDS_FOLDER)) {
    fs.mkdirSync(TRENDS_FOLDER, { recursive: true });
  }

  const trendsData = {
    date: today,
    timestamp: new Date().toISOString(),
    sources: {
      googleTrends: {
        count: googleTrends.length,
        items: googleTrends
      },
      rssFeeds: {
        count: rssNews.length,
        items: rssNews
      }
    },
    // Main trends array - 90% Google Trends priority
    trends: googleTrends,
    // RSS news for supplementary data
    rssNews: rssNews,
    totalCount: googleTrends.length + rssNews.length
  };

  // Save to file
  const trendsFile = `${TRENDS_FOLDER}/${today}.json`;
  fs.writeFileSync(trendsFile, JSON.stringify(trendsData, null, 2));
  console.log(`\n💾 Saved ${trendsData.totalCount} total items to ${trendsFile}`);

  return trendsData;
}

// Test function
export async function testScraper() {
  console.log('Testing trends scraper with debug...\n');
  const data = await fetchAllTrends(true); // debug=true
  console.log('\n--- Summary ---');
  console.log(`Google Trends: ${data.sources.googleTrends.count}`);
  console.log(`RSS Feeds: ${data.sources.rssFeeds.count}`);
  console.log(`Total: ${data.totalCount}`);
}
