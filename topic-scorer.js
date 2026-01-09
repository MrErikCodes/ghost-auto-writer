import { getNextTrendingTopic } from './rss-fetcher.js';
import { getNextSeoGapTopic } from './seo-gaps.js';
import { getNextTrendTopic } from './trends-fetcher.js';
import { contentTypes, getRandomTopicFromCategory } from './content-types.js';
import { getNextStore, getNextTopicIndex } from './category-rotator.js';
import { loadGeneratedTopics } from './generated-topics.js';

// Get the next topic based on category
export async function getNextTopic(category) {
  const generatedTopics = await loadGeneratedTopics();

  switch (category) {
    case 'trending':
      return await getTrendingTopic(generatedTopics);

    case 'seo-gap':
      return await getSeoGapTopic(generatedTopics);

    case 'store-guide':
      return getStoreTopic(generatedTopics);

    case 'business':
      return getBusinessTopic(generatedTopics);

    case 'problem-solving':
      return getProblemTopic(generatedTopics);

    case 'life-situation':
      return getLifeSituationTopic(generatedTopics);

    case 'feature-highlight':
      return getFeatureTopic(generatedTopics);

    case 'seasonal':
      return getSeasonalTopic(generatedTopics);

    default:
      return getRandomTopicFromCategory(category);
  }
}

// Get trending topic from RSS feeds
async function getTrendingTopic(excludeTopics) {
  // Try RSS first
  let topic = await getNextTrendingTopic(excludeTopics);

  // If no RSS topics, try Google Trends
  if (!topic) {
    topic = await getNextTrendTopic(excludeTopics);
  }

  // Fallback to generic trending topics
  if (!topic) {
    const fallbackTopics = [
      'Nye forbrukerrettigheter i 2025 - dette må du vite',
      'Digitalisering av kvitteringer - trenden som fortsetter',
      'Rekordmange nordmenn handler på nett - slik holder du orden'
    ];
    const index = Math.floor(Math.random() * fallbackTopics.length);
    topic = { type: 'trending', topic: fallbackTopics[index] };
  }

  return { category: 'trending', ...topic };
}

// Get SEO gap topic from Search Console data
async function getSeoGapTopic(excludeTopics) {
  const gap = await getNextSeoGapTopic(excludeTopics);

  if (gap) {
    return {
      category: 'seo-gap',
      query: gap.query,
      topic: `Artikkel optimalisert for: "${gap.query}"`,
      impressions: gap.impressions,
      position: gap.position
    };
  }

  // Fallback
  return {
    category: 'seo-gap',
    query: 'digital kvittering',
    topic: 'Digitale kvitteringer - alt du trenger å vite'
  };
}

// Get store-specific topic
function getStoreTopic(excludeTopics) {
  const store = getNextStore();
  const type = contentTypes['store-guide'];
  const storeData = type.topics.find(t => t.store === store);

  if (storeData) {
    // Pick a random angle for this store
    const angleIndex = Math.floor(Math.random() * storeData.angles.length);
    return {
      category: 'store-guide',
      store: store,
      topic: storeData.angles[angleIndex]
    };
  }

  return {
    category: 'store-guide',
    store: store,
    topic: `Slik finner du kvitteringer fra ${store}`
  };
}

// Get business/ENK topic
function getBusinessTopic(excludeTopics) {
  const type = contentTypes.business;
  const index = getNextTopicIndex('business', type.topics.length);

  return {
    category: 'business',
    topic: type.topics[index]
  };
}

// Get problem-solving topic
function getProblemTopic(excludeTopics) {
  const type = contentTypes['problem-solving'];
  const index = getNextTopicIndex('problem-solving', type.topics.length);

  return {
    category: 'problem-solving',
    topic: type.topics[index]
  };
}

// Get life situation topic
function getLifeSituationTopic(excludeTopics) {
  const type = contentTypes['life-situation'];
  const index = getNextTopicIndex('life-situation', type.topics.length);

  return {
    category: 'life-situation',
    topic: type.topics[index]
  };
}

// Get feature highlight topic
function getFeatureTopic(excludeTopics) {
  const type = contentTypes['feature-highlight'];
  const index = getNextTopicIndex('feature-highlight', type.topics.length);

  return {
    category: 'feature-highlight',
    topic: type.topics[index]
  };
}

// Get seasonal topic based on current month
function getSeasonalTopic(excludeTopics) {
  const type = contentTypes.seasonal;
  const currentMonth = new Date().getMonth() + 1;

  // Find topic for current month
  let seasonalTopic = type.topics.find(t => t.month === currentMonth);

  // If not found, pick a random one
  if (!seasonalTopic) {
    const index = Math.floor(Math.random() * type.topics.length);
    seasonalTopic = type.topics[index];
  }

  return {
    category: 'seasonal',
    topic: seasonalTopic.topic,
    month: seasonalTopic.month
  };
}
