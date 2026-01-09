import googleTrends from 'google-trends-api';

// Keywords to track trends for
const trendKeywords = [
  'kvittering',
  'garanti mobil',
  'reklamasjon',
  'forbrukerrettigheter',
  'digital kvittering',
  'iphone garanti',
  'samsung garanti',
  'elkjøp',
  'power elektronikk',
  'clas ohlson'
];

// Fetch related queries from Google Trends for Norway
export async function fetchTrendingSearches() {
  const topics = [];

  for (const keyword of trendKeywords) {
    try {
      const result = await googleTrends.relatedQueries({
        keyword: keyword,
        geo: 'NO',
        hl: 'no'
      });

      const data = JSON.parse(result);
      const rising = data.default?.rankedList?.[1]?.rankedKeyword || [];

      for (const item of rising.slice(0, 5)) {
        topics.push({
          type: 'trend',
          keyword: item.query,
          baseKeyword: keyword,
          value: item.value,
          formattedValue: item.formattedValue
        });
      }
    } catch (error) {
      // Google Trends API can be rate-limited, continue with other keywords
      console.log(`Trends fetch failed for "${keyword}": ${error.message}`);
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return topics;
}

// Get interest over time for a specific keyword
export async function getInterestOverTime(keyword) {
  try {
    const result = await googleTrends.interestOverTime({
      keyword: keyword,
      geo: 'NO',
      hl: 'no'
    });

    const data = JSON.parse(result);
    return data.default?.timelineData || [];
  } catch (error) {
    console.log(`Interest over time failed for "${keyword}": ${error.message}`);
    return [];
  }
}

// Check if a topic is currently trending
export async function isTrending(keyword) {
  try {
    const result = await googleTrends.dailyTrends({
      geo: 'NO',
      hl: 'no'
    });

    const data = JSON.parse(result);
    const trends = data.default?.trendingSearchesDays?.[0]?.trendingSearches || [];

    return trends.some(t =>
      t.title?.query?.toLowerCase().includes(keyword.toLowerCase())
    );
  } catch (error) {
    return false;
  }
}

// Get next trending topic for article generation
export async function getNextTrendTopic(excludeTopics = []) {
  const trends = await fetchTrendingSearches();

  // Filter out already used topics
  const available = trends.filter(t =>
    !excludeTopics.some(e =>
      e.keyword?.toLowerCase() === t.keyword?.toLowerCase()
    )
  );

  if (available.length === 0) {
    return null;
  }

  return available[0];
}
