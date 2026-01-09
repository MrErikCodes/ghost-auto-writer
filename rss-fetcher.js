import Parser from 'rss-parser';
import { config } from './config.js';

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'MineKvitteringer Blog Generator'
  }
});

// Keywords relevant to minekvitteringer.no
const relevantKeywords = [
  'kvittering', 'garanti', 'reklamasjon', 'retur', 'forsikring',
  'telefon', 'mobil', 'iphone', 'samsung', 'elektronikk', 'hvitevarer',
  'skattetaten', 'fradrag', 'mva', 'regnskap', 'enkeltpersonforetak',
  'forbruker', 'forbrukerrett', 'kjøp', 'handel', 'netthandel',
  'elkjøp', 'power', 'clas ohlson', 'komplett', 'xxl', 'jysk',
  'pris', 'tilbud', 'black friday', 'salg', 'kampanje',
  'dokumentasjon', 'lagring', 'digital', 'app', 'tjeneste'
];

// Check if an article is relevant to our niche
function isRelevant(item) {
  const text = `${item.title} ${item.contentSnippet || ''} ${item.content || ''}`.toLowerCase();
  return relevantKeywords.some(keyword => text.includes(keyword.toLowerCase()));
}

// Fetch trending topics from RSS feeds
export async function fetchTrendingTopics() {
  const topics = [];

  for (const feed of config.rssFeeds) {
    try {
      console.log(`Fetching RSS: ${feed.name}...`);
      const result = await parser.parseURL(feed.url);

      for (const item of result.items.slice(0, 10)) {
        if (isRelevant(item)) {
          topics.push({
            type: 'trending',
            source: feed.name,
            title: item.title,
            link: item.link,
            snippet: item.contentSnippet?.substring(0, 200) || '',
            date: item.pubDate || new Date().toISOString(),
            relevanceScore: calculateRelevance(item)
          });
        }
      }
    } catch (error) {
      console.log(`Could not fetch ${feed.name}: ${error.message}`);
    }
  }

  // Sort by relevance and return top topics
  return topics.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

// Calculate relevance score based on keyword matches
function calculateRelevance(item) {
  const text = `${item.title} ${item.contentSnippet || ''}`.toLowerCase();
  let score = 0;

  for (const keyword of relevantKeywords) {
    if (text.includes(keyword.toLowerCase())) {
      score += 1;
      // Bonus for title matches
      if (item.title.toLowerCase().includes(keyword.toLowerCase())) {
        score += 2;
      }
    }
  }

  return score;
}

// Get a single trending topic for article generation
export async function getNextTrendingTopic(excludeTopics = []) {
  const topics = await fetchTrendingTopics();

  // Filter out already used topics
  const available = topics.filter(t =>
    !excludeTopics.some(e =>
      e.title?.toLowerCase() === t.title?.toLowerCase()
    )
  );

  if (available.length === 0) {
    return null;
  }

  return available[0];
}
