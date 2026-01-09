import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import fs from 'fs';
import googleTrends from 'google-trends-api';
import RSSParser from 'rss-parser';
import { config } from './config.js';
import { loadSearchConsoleData, findSeoGaps } from './seo-gaps.js';

const BRAIN_FILE = './data/agent-brain.json';
const TRENDS_FOLDER = './trends';

// Research agent with memory/brain
export class ResearchAgent {
  constructor() {
    this.brain = this.loadBrain();
  }

  // Load the agent's memory
  loadBrain() {
    try {
      if (fs.existsSync(BRAIN_FILE)) {
        return JSON.parse(fs.readFileSync(BRAIN_FILE, 'utf-8'));
      }
    } catch (error) {
      console.log('Starting with fresh brain');
    }

    return {
      lastResearch: null,
      trendingTopics: [],
      cachedTrends: null,
      historicalTrends: [], // Track which dates we've used trends from
      productCategories: {
        phones: { lastUpdated: null, trends: [] },
        tvs: { lastUpdated: null, trends: [] },
        laptops: { lastUpdated: null, trends: [] },
        appliances: { lastUpdated: null, trends: [] },
        gaming: { lastUpdated: null, trends: [] },
        wearables: { lastUpdated: null, trends: [] },
        audio: { lastUpdated: null, trends: [] },
        homeAndGarden: { lastUpdated: null, trends: [] }
      },
      suggestedTopics: [],
      researchHistory: [],
      insights: []
    };
  }

  // Save the agent's memory
  saveBrain() {
    const dir = './data';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(BRAIN_FILE, JSON.stringify(this.brain, null, 2));
  }

  // Fetch real Google Trends data for Norway
  async fetchGoogleTrends(keywords) {
    console.log('📈 Henter Google Trends data...');
    const trendsData = [];

    for (const keyword of keywords) {
      try {
        // Get related queries
        const relatedResult = await googleTrends.relatedQueries({
          keyword: keyword,
          geo: 'NO',
          hl: 'no'
        });
        const relatedData = JSON.parse(relatedResult);
        const rising = relatedData.default?.rankedList?.[1]?.rankedKeyword || [];
        const top = relatedData.default?.rankedList?.[0]?.rankedKeyword || [];

        // Get interest over time
        const interestResult = await googleTrends.interestOverTime({
          keyword: keyword,
          geo: 'NO',
          hl: 'no'
        });
        const interestData = JSON.parse(interestResult);
        const timeline = interestData.default?.timelineData || [];
        const recentInterest = timeline.slice(-4).map(t => t.value[0]);
        const avgInterest = recentInterest.length > 0
          ? recentInterest.reduce((a, b) => a + b, 0) / recentInterest.length
          : 0;

        trendsData.push({
          keyword,
          risingQueries: rising.slice(0, 5).map(r => ({ query: r.query, growth: r.formattedValue })),
          topQueries: top.slice(0, 5).map(t => ({ query: t.query, value: t.value })),
          recentInterest: avgInterest,
          trend: avgInterest > 50 ? 'hot' : avgInterest > 25 ? 'medium' : 'low'
        });

        // Delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.log(`  ⚠ Kunne ikke hente trends for "${keyword}": ${error.message}`);
        // Still add a basic entry so we have something
        trendsData.push({
          keyword,
          risingQueries: [],
          topQueries: [],
          recentInterest: 0,
          trend: 'unknown',
          error: error.message
        });
      }
    }

    return trendsData;
  }

  // Load trends from a specific date
  loadTrendsFromDate(dateString) {
    try {
      const trendsFile = `${TRENDS_FOLDER}/${dateString}.json`;
      if (fs.existsSync(trendsFile)) {
        const trendsData = JSON.parse(fs.readFileSync(trendsFile, 'utf-8'));
        console.log(`📊 Lastet ${trendsData.totalCount} trender fra ${dateString}`);
        return trendsData.trends;
      }
    } catch (error) {
      console.log(`  Kunne ikke laste trender fra ${dateString}: ${error.message}`);
    }
    return null;
  }

  // Fetch daily trends with fallback to previous days if today's trends are poor
  async fetchDailyTrendsWithFallback() {
    console.log('📊 Henter dagens trender med fallback...');

    // First try today's trends
    let trends = await this.fetchDailyTrends();

    // If we have very few trends or no trends, try previous days
    if (!trends || trends.length < 10) {
      console.log(`  ⚠ Få trender i dag (${trends?.length || 0}), prøver tidligere dager...`);

      // Try the last 7 days
      for (let i = 1; i <= 7; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateString = date.toISOString().split('T')[0];

        const historicalTrends = this.loadTrendsFromDate(dateString);
        if (historicalTrends && historicalTrends.length >= 10) {
          console.log(`  ✓ Bruker ${historicalTrends.length} trender fra ${dateString} som fallback`);

          // Track that we used historical trends
          if (!this.brain.historicalTrends) {
            this.brain.historicalTrends = [];
          }
          const trendUsage = {
            date: dateString,
            usedAsFallback: true,
            trendCount: historicalTrends.length,
            timestamp: new Date().toISOString()
          };
          this.brain.historicalTrends.push(trendUsage);

          // Keep only last 10 historical trend usages
          if (this.brain.historicalTrends.length > 10) {
            this.brain.historicalTrends = this.brain.historicalTrends.slice(-10);
          }

          this.saveBrain();
          return historicalTrends;
        }
      }

      console.log('  ℹ Ingen gode historiske trender funnet, bruker dagens data');
    }

    return trends;
  }

  // Force fresh fetch by clearing cache
  clearTrendsCache() {
    console.log('🧹 Tømmer trend-cache for å hente ferske data...');
    this.brain.cachedTrends = null;
    this.saveBrain();
  }

  // Helper: Try to get related queries with retry and better error handling
  async tryGetRelatedQueries(keyword, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Longer delay between attempts
        if (attempt > 0) {
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        }

        const result = await googleTrends.relatedQueries({
          keyword: keyword,
          geo: 'NO',
          hl: 'no'
        });

        // Check if result is HTML (error page)
        if (typeof result === 'string' && result.trim().startsWith('<')) {
          throw new Error('Received HTML instead of JSON (likely rate limit/captcha)');
        }

        const data = JSON.parse(result);
        return {
          rising: data.default?.rankedList?.[1]?.rankedKeyword || [],
          top: data.default?.rankedList?.[0]?.rankedKeyword || []
        };
      } catch (error) {
        if (attempt === retries) {
          // Last attempt failed
          return null;
        }
        // Try again with longer delay
      }
    }
    return null;
  }

  // Fetch trending topics from Google Trends RSS (works for Norway!)
  // Caches results for the day to avoid repeated API calls
  async fetchDailyTrends() {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Check if we already have today's trends cached
    if (this.brain.cachedTrends?.date === today && this.brain.cachedTrends?.data?.length > 0) {
      console.log(`📊 Bruker cached trender fra i dag (${this.brain.cachedTrends.data.length} trender)`);
      return this.brain.cachedTrends.data;
    }

    console.log('📊 Henter ferske trender fra Google Trends Norge...');

    const allItems = [];
    const seenTitles = new Set();

    try {
      const parser = new RSSParser();

    // Try multiple RSS feeds
    const rssFeeds = [
      { url: 'https://trends.google.com/trending/rss?geo=NO', name: 'NO-general' },
      // Can add more feeds here if available
    ];

    // Fetch from all RSS feeds
    for (const feed of rssFeeds) {
      try {
        const feedData = await parser.parseURL(feed.url);
        if (feedData.items) {
          feedData.items.forEach(item => {
            const title = item.title?.toLowerCase();
            if (title && !seenTitles.has(title)) {
              seenTitles.add(title);
              allItems.push({
                title: item.title,
                traffic: item['ht:approx_traffic'] || 'Trending',
                articles: [],
                relatedQueries: [],
                source: `google-trends-rss-${feed.name}`
              });
            }
          });
          console.log(`  ✓ Hentet ${feedData.items.length} trender fra ${feed.name}`);
        }
      } catch (error) {
        console.log(`  ⚠ Kunne ikke hente fra ${feed.name}: ${error.message}`);
      }
    }

    // Fallback: Try manual XML parsing if RSS parser fails
    if (allItems.length === 0) {
      try {
        const response = await fetch('https://trends.google.com/trending/rss?geo=NO');
        const xml = await response.text();

        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let match;

        while ((match = itemRegex.exec(xml)) !== null) {
          const itemXml = match[1];
          const titleMatch = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                            itemXml.match(/<title>(.*?)<\/title>/);
          const trafficMatch = itemXml.match(/<ht:approx_traffic>(.*?)<\/ht:approx_traffic>/);

          if (titleMatch) {
            const title = titleMatch[1].toLowerCase();
            if (!seenTitles.has(title)) {
              seenTitles.add(title);
              allItems.push({
                title: titleMatch[1],
                traffic: trafficMatch ? trafficMatch[1] : 'Trending',
                articles: [],
                relatedQueries: [],
                source: 'google-trends-rss-manual'
              });
            }
          }
        }
      } catch (error) {
        console.log(`  ⚠ Kunne ikke hente Google Trends RSS: ${error.message}`);
      }
    }

      if (allItems.length > 0) {
        console.log(`  📊 Fant ${allItems.length} trender fra RSS feed, utvider med related queries...`);
        
        // Start with RSS items
        const allTrends = [...allItems];

        // Extract keywords from RSS trends to use as seeds
        const rssKeywords = allItems
          .map(item => item.title.toLowerCase())
          .filter(title => title.length > 3 && title.length < 30)
          .slice(0, 20); // Use top 20 RSS trends as keywords

        // Combine with popular product keywords
        const expandKeywords = [
          ...rssKeywords, // Use RSS trends as keywords first
          'iphone', 'samsung', 'nokia', 'huawei', 'oneplus', 'xiaomi',
          'playstation', 'xbox', 'nintendo', 'gaming',
          'macbook', 'laptop', 'pc', 'windows',
          'tv', 'oled', 'samsung tv', 'lg tv',
          'vaskemaskin', 'kjøleskap', 'oppvaskmaskin', 'tørketrommel',
          'elkjøp', 'power', 'komplett', 'netonnet',
          'apple watch', 'garmin', 'fitbit',
          'airpods', 'sony', 'bose',
          'ikea', 'jysk', 'skeidar',
          'mobiltelefon', 'smartphone', 'tablet', 'ipad'
        ];

        // Remove duplicates
        const uniqueKeywords = [...new Set(expandKeywords)];

        console.log(`  🔍 Prøver å utvide med ${uniqueKeywords.length} nøkkelord...`);

        // Get related queries for each keyword to expand our trend list
        let successCount = 0;
        let failCount = 0;

        for (const keyword of uniqueKeywords) {
          if (allTrends.length >= 200) {
            console.log(`  ✓ Nådd maksgrense på 200 trender`);
            break;
          }

          const queries = await this.tryGetRelatedQueries(keyword);
          
          if (queries) {
            successCount++;
            
            // Add rising queries (up to 10 per keyword)
            queries.rising.slice(0, 10).forEach(r => {
              const title = r.query?.toLowerCase();
              if (title && !seenTitles.has(title) && allTrends.length < 200) {
                seenTitles.add(title);
                allTrends.push({
                  title: r.query,
                  traffic: r.formattedValue || 'Rising',
                  articles: [],
                  relatedQueries: [keyword],
                  source: 'rising-NO-expanded'
                });
              }
            });

            // Add top queries (up to 5 per keyword)
            queries.top.slice(0, 5).forEach(t => {
              const title = t.query?.toLowerCase();
              if (title && !seenTitles.has(title) && allTrends.length < 200) {
                seenTitles.add(title);
                allTrends.push({
                  title: t.query,
                  traffic: `${t.value || 'Top'}`,
                  articles: [],
                  relatedQueries: [keyword],
                  source: 'top-NO-expanded'
                });
              }
            });

            // Longer delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
          } else {
            failCount++;
            // Shorter delay on failure
            await new Promise(resolve => setTimeout(resolve, 500));
          }

          // Progress update every 10 keywords
          if ((successCount + failCount) % 10 === 0) {
            console.log(`  📈 Fremdrift: ${allTrends.length} trender (${successCount} vellykkede, ${failCount} feilet)`);
          }
        }

        console.log(`  ✓ Ferdig: ${allTrends.length} trender totalt (${successCount} vellykkede API-kall, ${failCount} feilet)`);

        const results = allTrends.slice(0, 200); // Ensure max 200

        // Create trends folder if it doesn't exist
        if (!fs.existsSync(TRENDS_FOLDER)) {
          fs.mkdirSync(TRENDS_FOLDER, { recursive: true });
        }

        // Save all trends to date-stamped file
        const trendsFile = `${TRENDS_FOLDER}/${today}.json`;
        const trendsData = {
          date: today,
          timestamp: new Date().toISOString(),
          source: 'google-trends-rss-expanded',
          trends: results,
          totalCount: results.length,
          rssCount: allItems.length,
          expandedCount: results.length - allItems.length,
          apiStats: {
            successful: successCount,
            failed: failCount
          }
        };
        fs.writeFileSync(trendsFile, JSON.stringify(trendsData, null, 2));
        console.log(`  💾 Lagret ${results.length} trender til ${trendsFile} (${allItems.length} fra RSS, ${results.length - allItems.length} utvidet)`);

        // Cache for today
        this.brain.cachedTrends = { date: today, data: results };
        this.saveBrain();
        console.log(`  ✓ Fant ${results.length} trending søk fra Google Trends Norge (cached)`);
        return results;
      }
    } catch (error) {
      console.log(`  ⚠ Kunne ikke hente Google Trends RSS: ${error.message}`);
    }

    // Fallback: Use relatedQueries API with many keywords (only if RSS failed or returned few items)
    if (allItems.length < 10) {
    console.log('  Prøver alternativ metode med utvidede søkeord...');
    const trendingTopics = [];
    const seenTitles = new Set();

    const trendKeywords = [
      // Electronics
      'iphone', 'samsung', 'nokia', 'huawei', 'oneplus', 'xiaomi', 'oppo',
      'playstation', 'xbox', 'nintendo switch', 'gaming pc',
      'macbook', 'laptop', 'windows pc', 'chromebook',
      'tv', 'oled', 'samsung tv', 'lg tv', 'sony tv',
      // Appliances
      'vaskemaskin', 'kjøleskap', 'oppvaskmaskin', 'tørketrommel', 'komfyr',
      // Stores
      'elkjøp', 'power', 'komplett', 'netonnet', 'clas ohlson', 'jernia',
      // Wearables
      'apple watch', 'garmin', 'fitbit', 'samsung watch',
      // Audio
      'airpods', 'sony headphones', 'bose', 'jbl',
      // Home
      'ikea', 'jysk', 'skeidar', 'møbler',
      // General tech
      'smartphone', 'tablet', 'ipad', 'android', 'ios'
    ];

    let successCount = 0;
    let failCount = 0;

    for (const keyword of trendKeywords) {
      if (trendingTopics.length >= 200) {
        console.log(`  ✓ Nådd maksgrense på 200 trender`);
        break;
      }

      const queries = await this.tryGetRelatedQueries(keyword);
      
      if (queries) {
        successCount++;
        
        // Add rising queries (up to 15 per keyword)
        queries.rising.slice(0, 15).forEach(r => {
          const title = r.query?.toLowerCase();
          if (r.query && title && !seenTitles.has(title) && trendingTopics.length < 200) {
            seenTitles.add(title);
            trendingTopics.push({
              title: r.query,
              traffic: r.formattedValue || 'Rising',
              articles: [],
              relatedQueries: [keyword],
              source: 'rising-NO-fallback'
            });
          }
        });

        // Add top queries (up to 10 per keyword)
        queries.top.slice(0, 10).forEach(t => {
          const title = t.query?.toLowerCase();
          if (t.query && title && !seenTitles.has(title) && trendingTopics.length < 200) {
            seenTitles.add(title);
            trendingTopics.push({
              title: t.query,
              traffic: `${t.value || 'Top'}`,
              articles: [],
              relatedQueries: [keyword],
              source: 'top-NO-fallback'
            });
          }
        });

        // Longer delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        failCount++;
        // Shorter delay on failure
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Progress update every 10 keywords
      if ((successCount + failCount) % 10 === 0) {
        console.log(`  📈 Fremdrift: ${trendingTopics.length} trender (${successCount} vellykkede, ${failCount} feilet)`);
      }
    }

    console.log(`  ✓ Fallback ferdig: ${trendingTopics.length} trender totalt (${successCount} vellykkede API-kall, ${failCount} feilet)`);

    if (trendingTopics.length > 0) {
      const results = trendingTopics.slice(0, 200); // Save up to 200 trending keywords

      // Create trends folder if it doesn't exist
      if (!fs.existsSync(TRENDS_FOLDER)) {
        fs.mkdirSync(TRENDS_FOLDER, { recursive: true });
      }

      // Save all trends to date-stamped file
      const trendsFile = `${TRENDS_FOLDER}/${today}.json`;
      const trendsData = {
        date: today,
        timestamp: new Date().toISOString(),
        source: 'rising-NO-fallback',
        trends: results,
        totalCount: results.length,
        apiStats: {
          successful: successCount,
          failed: failCount
        }
      };
      fs.writeFileSync(trendsFile, JSON.stringify(trendsData, null, 2));
      console.log(`  💾 Lagret ${results.length} trender til ${trendsFile}`);

      // Cache for today
      this.brain.cachedTrends = { date: today, data: results };
      this.saveBrain();
      console.log(`  ✓ Fant ${results.length} trending søk (cached)`);
      return results;
    }
    }

    // Default fallback - save these too for logging purposes
    console.log('  ℹ Bruker standard produktliste');
    const defaultTrends = [
      { title: 'iPhone 16', traffic: 'Populær', relatedQueries: ['apple'], source: 'default' },
      { title: 'Samsung Galaxy', traffic: 'Populær', relatedQueries: ['samsung'], source: 'default' },
      { title: 'PlayStation 5', traffic: 'Populær', relatedQueries: ['gaming'], source: 'default' }
    ];

    // Create trends folder if it doesn't exist
    if (!fs.existsSync(TRENDS_FOLDER)) {
      fs.mkdirSync(TRENDS_FOLDER, { recursive: true });
    }

    // Save default trends to date-stamped file
    const trendsFile = `${TRENDS_FOLDER}/${today}.json`;
    const trendsData = {
      date: today,
      timestamp: new Date().toISOString(),
      source: 'default-fallback',
      trends: defaultTrends,
      totalCount: defaultTrends.length
    };
    fs.writeFileSync(trendsFile, JSON.stringify(trendsData, null, 2));
    console.log(`  💾 Lagret ${defaultTrends.length} standard trender til ${trendsFile}`);

    return defaultTrends;
  }

  // Analyze Search Console data for opportunities
  async analyzeSearchConsole() {
    console.log('🔍 Analyserer Search Console data...');

    try {
      const data = await loadSearchConsoleData();
      const gaps = await findSeoGaps(30, 3); // Lower thresholds for more data

      // Find high-opportunity keywords
      const opportunities = gaps.slice(0, 20).map(g => ({
        keyword: g.query,
        impressions: g.impressions,
        clicks: g.clicks,
        ctr: g.ctr,
        position: g.position,
        opportunity: g.opportunityScore
      }));

      // Find top performing keywords to learn from
      const topPerformers = data.queries
        .filter(q => q.clicks > 2)
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 10)
        .map(q => ({
          keyword: q.query,
          clicks: q.clicks,
          impressions: q.impressions,
          ctr: q.ctr,
          position: q.position
        }));

      // Find keyword themes
      const themes = this.extractKeywordThemes(data.queries);

      return {
        opportunities,
        topPerformers,
        themes,
        totalQueries: data.queries.length,
        totalClicks: data.queries.reduce((sum, q) => sum + q.clicks, 0),
        totalImpressions: data.queries.reduce((sum, q) => sum + q.impressions, 0)
      };
    } catch (error) {
      console.log('  Kunne ikke analysere Search Console:', error.message);
      return null;
    }
  }

  // Extract themes from keywords
  extractKeywordThemes(queries) {
    const themes = {
      stores: [],
      products: [],
      problems: [],
      warranties: [],
      business: []
    };

    const storeKeywords = config.stores.map(s => s.toLowerCase());
    const productKeywords = ['mobil', 'telefon', 'tv', 'laptop', 'pc', 'vaskemaskin', 'kjøleskap', 'iphone', 'samsung', 'macbook'];
    const problemKeywords = ['finner ikke', 'mistet', 'bleknet', 'funker ikke', 'uten kvittering', 'reklamasjon'];
    const warrantyKeywords = ['garanti', 'reklamasjon', 'retur', 'bytte'];
    const businessKeywords = ['enkeltpersonforetak', 'enk', 'mva', 'fradrag', 'regnskap', 'firma'];

    for (const q of queries) {
      const query = q.query.toLowerCase();

      // Check stores
      for (const store of storeKeywords) {
        if (query.includes(store) && !themes.stores.find(s => s.store === store)) {
          themes.stores.push({ store, query: q.query, impressions: q.impressions });
        }
      }

      // Check products
      for (const product of productKeywords) {
        if (query.includes(product)) {
          themes.products.push({ product, query: q.query, impressions: q.impressions });
          break;
        }
      }

      // Check problems
      for (const problem of problemKeywords) {
        if (query.includes(problem)) {
          themes.problems.push({ problem, query: q.query, impressions: q.impressions });
          break;
        }
      }

      // Check warranty
      for (const warranty of warrantyKeywords) {
        if (query.includes(warranty)) {
          themes.warranties.push({ topic: warranty, query: q.query, impressions: q.impressions });
          break;
        }
      }

      // Check business
      for (const biz of businessKeywords) {
        if (query.includes(biz)) {
          themes.business.push({ topic: biz, query: q.query, impressions: q.impressions });
          break;
        }
      }
    }

    return {
      stores: themes.stores.slice(0, 10),
      products: themes.products.slice(0, 10),
      problems: themes.problems.slice(0, 10),
      warranties: themes.warranties.slice(0, 10),
      business: themes.business.slice(0, 10)
    };
  }

  // Main research function - the agent thinks about what to research
  // researchRound: which attempt this is (1 = first, 2+ = need more creative ideas)
  async research(focus = null, articleCount = 5, previousTopics = [], researchRound = 1) {
    console.log('\n🧠 Research Agent aktivert...\n');

    // Force fresh trends if we have very few cached (less than 50)
    const today = new Date().toISOString().split('T')[0];
    if (this.brain.cachedTrends?.date === today && this.brain.cachedTrends?.data?.length < 50) {
      console.log(`  ⚠ Få cached trender (${this.brain.cachedTrends.data.length}), henter ferske data...`);
      this.clearTrendsCache();
    }

    // Step 1: Gather real data
    const relevantKeywords = [
      'iphone', 'samsung', 'nokia', 'huawei', 'oneplus', // Popular brands with global data
      'mobiltelefon', 'smartphone', 'android', 'ios', // Generic terms
      'elektronikk', 'hvitevarer', 'data', 'gaming' // Categories
    ];

    // Fetch real data in parallel
    console.log(`🔍 Henter data for keywords: ${focus ? [focus] : relevantKeywords.slice(0, 5).join(', ')}`);
    const [googleTrendsData, dailyTrends, searchConsoleData] = await Promise.all([
      this.fetchGoogleTrends(focus ? [focus] : relevantKeywords.slice(0, 5)),
      this.fetchDailyTrendsWithFallback(),
      this.analyzeSearchConsole()
    ]);

    console.log(`📊 Hentet ${googleTrendsData.length} trend-data punkter, ${dailyTrends.length} daglige trender, ${searchConsoleData ? 'Search Console OK' : 'Search Console failed'}`);

    // Store raw data in brain
    this.brain.rawData = {
      lastFetched: new Date().toISOString(),
      googleTrends: googleTrendsData,
      dailyTrends: dailyTrends,
      searchConsole: searchConsoleData
    };

    console.log('\n🤖 Analyserer data med AI...\n');

    const researchPrompt = `Du er en research-agent for minekvitteringer.no, en norsk digital kvitteringslagringstjeneste.

Din oppgave er å analysere EKTE DATA og finne de beste mulighetene for SEO-artikler.

## EKTE GOOGLE TRENDS DATA (Norge):
${JSON.stringify(googleTrendsData, null, 2)}

## DAGLIGE TRENDER I NORGE:
${JSON.stringify(dailyTrends, null, 2)}

## SEARCH CONSOLE DATA (våre faktiske søkeord):
### Top SEO-muligheter (høye visninger, lave klikk):
${JSON.stringify(searchConsoleData?.opportunities?.slice(0, 10), null, 2)}

### Våre best-performende søkeord:
${JSON.stringify(searchConsoleData?.topPerformers, null, 2)}

### Tema-analyse fra våre søkeord:
${JSON.stringify(searchConsoleData?.themes, null, 2)}

## ALLEREDE GENERERTE/FORESLÅTTE ARTIKLER (UNNGÅ DISSE!):
${previousTopics.length > 0 ? previousTopics.slice(-50).map(t => `- "${t.title || t.topic}" (keyword: ${t.query || 'N/A'})`).join('\n') : 'Ingen tidligere artikler'}

⚠️ KRITISK: Du MÅ foreslå artikler som er HELT FORSKJELLIGE fra de ovenfor!
- IKKE gjenta emner vi allerede har dekket
- IKKE foreslå lignende titler eller søkeord
- Finn NYE vinkler, nye butikker, nye problemstillinger
- ${previousTopics.length > 20 ? '⚡ Vi har mange artikler allerede - vær EKSTRA kreativ og finn nye nisjertemaer!' : 'Tenk bredt og kreativt'}

${researchRound > 1 ? `
🔄 DETTE ER RESEARCH-RUNDE ${researchRound}!
De forrige forslagene dine ble filtrert som duplikater. Du MÅ nå være MYE mer kreativ:
- Prøv HELT andre butikker (${config.stores.slice(Math.floor(Math.random() * 50), Math.floor(Math.random() * 50) + 20).join(', ')})
- Prøv ANDRE produktkategorier (hvitevarer, møbler, klær, sko, optikk, apotek)
- Finn NISJE-temaer som ingen andre skriver om
- Tenk på UVANLIGE situasjoner der kvitteringer trengs
- Vurder LOKALE vinkler (spesifikke norske forhold)
` : ''}

## DIN OPPGAVE:
Basert på DENNE EKTE DATAEN, identifiser:

FOKUS: ${focus ? focus : 'Generell analyse'}
DATO: ${new Date().toLocaleDateString('no-NO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

## INSTRUKSJONER:
1. Analyser Google Trends dataene - finn rising queries som er relevante for kvitteringer/garanti
2. Se på Search Console opportunities - disse er EKTE søkeord folk bruker, prioriter disse!
3. Koble daglige trender til kvitteringer/garanti hvis mulig
4. Bruk tema-analysen til å forstå hva som fungerer for oss

## PRIORITER:
- SEO-muligheter fra Search Console (vi VET folk søker på dette)
- Rising queries fra Google Trends (økende interesse)
- Søkeord der vi har posisjon 5-20 (kan forbedres med ny artikkel)
- Butikk-spesifikke søkeord med høye visninger

## GI MEG:

1. **${Math.ceil(articleCount * 0.8)} ARTIKKELIDEER** basert på EKTE data - prioriter Search Console muligheter
2. **${Math.max(Math.ceil(articleCount * 0.2), 2)} AI-KREATIVE IDEER** - DINE EGNE originale ideer! (se under)
3. **${Math.ceil(articleCount / 3)} TRENDING TOPICS** fra Google Trends som er relevante for oss
4. **${Math.ceil(articleCount / 3)} SEO-GAPS** - søkeord vi BØR skrive om basert på dataene
5. **SESONG-MULIGHETER** for ${new Date().toLocaleDateString('no-NO', { month: 'long' })}

## AI-KREATIV FRIHET (20% av innholdet):
Du har FULL FRIHET til å foreslå ${Math.max(Math.ceil(articleCount * 0.2), 2)} helt originale artikkelideer!

Disse skal være:
- DINE EGNE kreative ideer som du tror vil engasjere lesere
- Relevante for minekvitteringer.no (kvitteringer, garanti, dokumentasjon, forbrukerrett)
- NYE vinkler vi ikke har tenkt på - vær kreativ!
- Basert på din forståelse av markedet, ikke bare dataene

Eksempler på kreative vinkler:
- Uventede situasjoner der kvitteringer redder dagen
- Fremtidige trender i dokumentasjon/AI
- Psykologien bak å ta vare på kvitteringer
- Sammenligning med andre land
- Tips ingen snakker om
- Overraskende statistikk eller fakta

Merk disse med category: "ai-creative" og dataSource: "ai-creative"

Svar i JSON-format:
{
  "articleIdeas": [
    {
      "title": "SEO-optimalisert tittel",
      "primaryKeyword": "hovedsøkeord fra data",
      "keywords": ["søkeord1", "søkeord2"],
      "category": "trending/seo-gap/store-guide/business/problem-solving/life-situation/feature-highlight/seasonal/ai-creative",
      "priority": "high/medium/low",
      "dataSource": "search-console/google-trends/daily-trends/ai-creative",
      "rationale": "hvorfor dette er en god ide basert på dataene ELLER din kreative begrunnelse"
    }
  ],
  "trendingTopics": [
    { "topic": "trending topic", "source": "google-trends", "relevance": "hvordan koble til kvitteringer", "risingQueries": ["query1", "query2"] }
  ],
  "seoGaps": [
    { "keyword": "søkeord", "impressions": 123, "currentPosition": 5, "suggestedTitle": "artikkel-tittel", "opportunity": "hvorfor dette er en mulighet" }
  ],
  "aiCreativeIdeas": [
    { "title": "kreativ tittel", "primaryKeyword": "foreslått søkeord", "angle": "unik vinkel", "whyThisWorks": "din begrunnelse for hvorfor dette vil fungere" }
  ],
  "seasonalInsights": {
    "currentMonth": "måned",
    "opportunities": ["mulighet1", "mulighet2"],
    "upcomingEvents": ["event1", "event2"]
  },
  "dataInsights": {
    "topPerformingThemes": ["tema1", "tema2"],
    "emergingTopics": ["topic1", "topic2"],
    "recommendations": ["anbefaling1", "anbefaling2"]
  }
}`;

    try {
      const { text } = await generateText({
        model: openai(config.openaiModel),
        prompt: researchPrompt,
        maxTokens: 4000,
      });

      // Parse the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const research = JSON.parse(jsonMatch[0]);

        // Merge AI creative ideas into articleIdeas with proper formatting
        if (research.aiCreativeIdeas?.length > 0) {
          const creativeAsArticles = research.aiCreativeIdeas.map(idea => ({
            title: idea.title,
            primaryKeyword: idea.primaryKeyword,
            keywords: [idea.primaryKeyword],
            category: 'ai-creative',
            priority: 'medium',
            dataSource: 'ai-creative',
            rationale: idea.whyThisWorks || idea.angle
          }));
          research.articleIdeas = [...(research.articleIdeas || []), ...creativeAsArticles];
        }

        // Update brain with new research
        this.brain.lastResearch = new Date().toISOString();
        this.brain.trendingTopics = research.trendingTopics || [];
        this.brain.suggestedTopics = research.articleIdeas || [];
        this.brain.seoGaps = research.seoGaps || [];
        this.brain.aiCreativeIdeas = research.aiCreativeIdeas || [];
        this.brain.dataInsights = research.dataInsights || {};

        this.brain.insights.push({
          date: new Date().toISOString(),
          seasonal: research.seasonalInsights,
          dataInsights: research.dataInsights
        });

        // Keep only last 10 insights
        if (this.brain.insights.length > 10) {
          this.brain.insights = this.brain.insights.slice(-10);
        }

        this.brain.researchHistory.push({
          date: new Date().toISOString(),
          focus: focus || 'general',
          topicsFound: research.articleIdeas?.length || 0
        });

        this.saveBrain();

        return research;
      }

      throw new Error('Could not parse research response');
    } catch (error) {
      console.error('Research failed:', error.message);
      return null;
    }
  }

  // Research specific product category
  async researchCategory(category) {
    console.log(`\n🔬 Researching ${category}...\n`);

    const categoryPrompts = {
      phones: 'mobiltelefoner, iPhone, Samsung Galaxy, Pixel, OnePlus, Xiaomi - nye modeller 2025/2026, garantivilkår, populære modeller i Norge',
      tvs: 'TV-er, OLED, QLED, Samsung, LG, Sony - nye modeller, størrelse-trender, smart-TV funksjoner, garantier',
      laptops: 'laptops, MacBook, gaming-laptops, business-laptops, Lenovo, HP, ASUS - trender 2025/2026',
      appliances: 'hvitevarer, vaskemaskiner, kjøleskap, oppvaskmaskin, tørketrommel - energimerking, garantier, populære merker',
      gaming: 'gaming, PlayStation, Xbox, Nintendo Switch, gaming-PC, tilbehør - nye lanseringer, tilbud',
      wearables: 'smartklokker, Apple Watch, Samsung Galaxy Watch, Garmin, fitness-trackere - helse-funksjoner, garanti',
      audio: 'hodetelefoner, AirPods, Sony, Bose, soundbars, høyttalere - trådløs audio trender',
      homeAndGarden: 'møbler, IKEA, Skeidar, hagemaskiner, verktøy, robotgressklippere - sesong-trender'
    };

    const prompt = `Research ${category} markedet i Norge 2025/2026.

Fokus: ${categoryPrompts[category] || category}

Gi meg:
1. Topp 5 produkter/modeller som er populære nå
2. Prisområder i Norge
3. Vanlige garantiproblemer
4. Hvilke butikker som selger mest
5. 3 artikkelideer relatert til kvitteringer og garanti

JSON-format:
{
  "category": "${category}",
  "topProducts": [{ "name": "navn", "priceRange": "prisområde", "popularStores": ["butikk"] }],
  "warrantyIssues": ["problem1", "problem2"],
  "articleIdeas": [{ "title": "tittel", "angle": "vinkel" }],
  "marketInsights": "kort oppsummering av markedet"
}`;

    try {
      const { text } = await generateText({
        model: openai(config.openaiModel),
        prompt: prompt,
        maxTokens: 2000,
      });

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const categoryData = JSON.parse(jsonMatch[0]);

        // Update brain
        if (this.brain.productCategories[category]) {
          this.brain.productCategories[category] = {
            lastUpdated: new Date().toISOString(),
            trends: categoryData.topProducts || [],
            insights: categoryData.marketInsights,
            articleIdeas: categoryData.articleIdeas
          };
          this.saveBrain();
        }

        return categoryData;
      }
    } catch (error) {
      console.error(`Category research failed for ${category}:`, error.message);
    }

    return null;
  }

  // Get suggested topics from brain
  getSuggestedTopics() {
    return this.brain.suggestedTopics;
  }

  // Get trending products from brain
  getTrendingProducts() {
    return this.brain.trendingTopics;
  }

  // Get insights from brain
  getInsights() {
    return this.brain.insights;
  }

  // Print brain summary
  printBrainSummary() {
    console.log('\n🧠 AGENT BRAIN SUMMARY\n');
    console.log(`Last research: ${this.brain.lastResearch || 'Never'}`);
    console.log(`Trending topics: ${this.brain.trendingTopics.length}`);
    console.log(`Suggested articles: ${this.brain.suggestedTopics.length}`);
    console.log(`Research sessions: ${this.brain.researchHistory.length}`);

    console.log('\nProduct Categories:');
    for (const [cat, data] of Object.entries(this.brain.productCategories)) {
      console.log(`  - ${cat}: ${data.lastUpdated ? 'Updated ' + new Date(data.lastUpdated).toLocaleDateString() : 'Not researched'}`);
    }

    if (this.brain.suggestedTopics.length > 0) {
      console.log('\nTop Suggested Topics:');
      this.brain.suggestedTopics.slice(0, 5).forEach((topic, i) => {
        console.log(`  ${i + 1}. ${topic.title} [${topic.priority || 'medium'}]`);
      });
    }
  }

  // Generate article ideas based on brain knowledge
  async generateSmartTopics(count = 5) {
    console.log(`\n💡 Generating ${count} smart topic ideas...\n`);

    const brainContext = {
      recentTrends: this.brain.trendingTopics.slice(0, 5),
      recentInsights: this.brain.insights.slice(-2),
      existingIdeas: this.brain.suggestedTopics.slice(0, 3)
    };

    const prompt = `Du er en SEO-ekspert for minekvitteringer.no.

Basert på denne konteksten fra tidligere research:
${JSON.stringify(brainContext, null, 2)}

Og dagens dato: ${new Date().toLocaleDateString('no-NO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

Generer ${count} NYE artikkelideer som:
1. Er relevante for kvitteringer, garanti og dokumentasjon
2. Har høyt søkepotensial i Norge
3. Ikke overlapper med eksisterende ideer
4. Passer for minekvitteringer.no sin målgruppe

For hver artikkel, gi:
- Tittel (SEO-optimalisert)
- Primært søkeord
- Sekundære søkeord
- Kategori (trending/seo-gap/store-guide/business/problem-solving/life-situation/feature-highlight/seasonal)
- Prioritet (high/medium/low)
- Kort beskrivelse av innholdet

JSON-format:
{
  "topics": [
    {
      "title": "tittel",
      "primaryKeyword": "hovedsøkeord",
      "secondaryKeywords": ["søkeord2", "søkeord3"],
      "category": "kategori",
      "priority": "high/medium/low",
      "description": "kort beskrivelse"
    }
  ]
}`;

    try {
      const { text } = await generateText({
        model: openai(config.openaiModel),
        prompt: prompt,
        maxTokens: 2000,
      });

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);

        // Add to brain
        if (result.topics) {
          this.brain.suggestedTopics = [
            ...result.topics,
            ...this.brain.suggestedTopics
          ].slice(0, 50); // Keep max 50 topics
          this.saveBrain();
        }

        return result.topics;
      }
    } catch (error) {
      console.error('Smart topic generation failed:', error.message);
    }

    return [];
  }
}

// Export singleton instance
export const researchAgent = new ResearchAgent();
