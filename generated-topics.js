import fs from 'fs';
import path from 'path';

const TOPICS_FILE = './data/generated-topics.json';

// Load previously generated topics
export async function loadGeneratedTopics() {
  try {
    if (fs.existsSync(TOPICS_FILE)) {
      const content = fs.readFileSync(TOPICS_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.log('Could not load generated topics, starting fresh');
  }

  return [];
}

// Save a newly generated topic
export async function saveGeneratedTopic(topic) {
  const topics = await loadGeneratedTopics();

  topics.push({
    ...topic,
    generatedAt: new Date().toISOString()
  });

  // Ensure data directory exists
  const dir = path.dirname(TOPICS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(TOPICS_FILE, JSON.stringify(topics, null, 2));
}

// Check if a topic has already been generated
export async function isTopicGenerated(topic) {
  const topics = await loadGeneratedTopics();

  // Check by title or query
  return topics.some(t => {
    if (topic.title && t.title) {
      return t.title.toLowerCase() === topic.title.toLowerCase();
    }
    if (topic.query && t.query) {
      return t.query.toLowerCase() === topic.query.toLowerCase();
    }
    if (topic.topic && t.topic) {
      return t.topic.toLowerCase() === topic.topic.toLowerCase();
    }
    return false;
  });
}

// Get statistics about generated content
export async function getGeneratedStats() {
  const topics = await loadGeneratedTopics();

  const categoryCounts = {};
  for (const topic of topics) {
    const cat = topic.category || 'unknown';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  }

  const last7Days = topics.filter(t => {
    const date = new Date(t.generatedAt);
    const now = new Date();
    const diffDays = (now - date) / (1000 * 60 * 60 * 24);
    return diffDays <= 7;
  });

  return {
    total: topics.length,
    last7Days: last7Days.length,
    byCategory: categoryCounts,
    lastGenerated: topics.length > 0 ? topics[topics.length - 1] : null
  };
}

// Clear all generated topics (for testing)
export async function clearGeneratedTopics() {
  const dir = path.dirname(TOPICS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(TOPICS_FILE, '[]');
}
