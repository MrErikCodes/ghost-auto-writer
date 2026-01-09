import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import fs from 'fs';
import googleTrends from 'google-trends-api';
import { config } from './config.js';
import { loadSearchConsoleData, findSeoGaps } from './seo-gaps.js';

const BRAIN_FILE = './data/agent-brain.json';

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
        console.log(`  Kunne ikke hente trends for "${keyword}"`);
      }
    }

    return trendsData;
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

    try {
      // Google Trends RSS feed for Norway - this actually works!
      const response = await fetch('https://trends.google.com/trending/rss?geo=NO');
      const xml = await response.text();

      // Parse RSS XML
      const items = [];
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;

      while ((match = itemRegex.exec(xml)) !== null) {
        const itemXml = match[1];

        const titleMatch = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                          itemXml.match(/<title>(.*?)<\/title>/);
        const trafficMatch = itemXml.match(/<ht:approx_traffic>(.*?)<\/ht:approx_traffic>/);
        const newsMatch = itemXml.match(/<ht:news_item_title><!\[CDATA\[(.*?)\]\]><\/ht:news_item_title>/g);

        if (titleMatch) {
          const newsItems = newsMatch ?
            newsMatch.map(n => n.replace(/<ht:news_item_title><!\[CDATA\[/, '').replace(/\]\]><\/ht:news_item_title>/, '')) :
            [];

          items.push({
            title: titleMatch[1],
            traffic: trafficMatch ? trafficMatch[1] : 'Trending',
            articles: newsItems.slice(0, 2),
            relatedQueries: [],
            source: 'google-trends-rss'
          });
        }
      }

      if (items.length > 0) {
        const results = items.slice(0, 15);
        // Cache for today
        this.brain.cachedTrends = { date: today, data: results };
        this.saveBrain();
        console.log(`  ✓ Fant ${results.length} trending søk fra Google Trends Norge (cached)`);
        return results;
      }
    } catch (error) {
      console.log(`  ⚠ Kunne ikke hente Google Trends RSS: ${error.message}`);
    }

    // Fallback: Use relatedQueries API
    console.log('  Prøver alternativ metode...');
    const trendingTopics = [];

    const trendKeywords = ['iphone', 'samsung', 'playstation', 'macbook'];

    for (const keyword of trendKeywords) {
      try {
        const result = await googleTrends.relatedQueries({
          keyword: keyword,
          geo: 'NO',
          hl: 'no'
        });
        const data = JSON.parse(result);
        const rising = data.default?.rankedList?.[1]?.rankedKeyword || [];

        rising.slice(0, 2).forEach(r => {
          if (r.query && !trendingTopics.find(t => t.title === r.query)) {
            trendingTopics.push({
              title: r.query,
              traffic: r.formattedValue || 'Rising',
              articles: [],
              relatedQueries: [keyword],
              source: 'rising-NO'
            });
          }
        });

        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (e) {
        // Skip
      }
    }

    if (trendingTopics.length > 0) {
      const results = trendingTopics.slice(0, 10);
      // Cache for today
      this.brain.cachedTrends = { date: today, data: results };
      this.saveBrain();
      console.log(`  ✓ Fant ${results.length} trending søk (cached)`);
      return results;
    }

    // Default fallback (don't cache defaults)
    console.log('  ℹ Bruker standard produktliste');
    return [
      { title: 'iPhone 16', traffic: 'Populær', relatedQueries: ['apple'], source: 'default' },
      { title: 'Samsung Galaxy', traffic: 'Populær', relatedQueries: ['samsung'], source: 'default' },
      { title: 'PlayStation 5', traffic: 'Populær', relatedQueries: ['gaming'], source: 'default' }
    ];
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

    // Step 1: Gather real data
    const relevantKeywords = [
      'kvittering', 'garanti', 'reklamasjon', 'iphone', 'samsung',
      'elkjøp', 'power', 'clas ohlson', 'forbrukerrett'
    ];

    // Fetch real data in parallel
    const [googleTrendsData, dailyTrends, searchConsoleData] = await Promise.all([
      this.fetchGoogleTrends(focus ? [focus] : relevantKeywords.slice(0, 5)),
      this.fetchDailyTrends(),
      this.analyzeSearchConsole()
    ]);

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
