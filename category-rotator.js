import fs from 'fs';
import path from 'path';
import { config } from './config.js';

const STATE_FILE = './data/rotation-state.json';

// Load the current rotation state
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const content = fs.readFileSync(STATE_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.log('Could not load rotation state, starting fresh');
  }

  return {
    currentIndex: 0,
    lastCategory: null,
    categoryHistory: [],
    storeIndex: 0,
    topicIndexes: {}
  };
}

// Save the rotation state
function saveState(state) {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// Get the next category in rotation
export function getNextCategory() {
  const state = loadState();
  const categories = config.categories;

  const category = categories[state.currentIndex % categories.length];

  // Update state
  state.currentIndex = (state.currentIndex + 1) % categories.length;
  state.lastCategory = category;
  state.categoryHistory.push({
    category,
    timestamp: new Date().toISOString()
  });

  // Keep only last 100 entries in history
  if (state.categoryHistory.length > 100) {
    state.categoryHistory = state.categoryHistory.slice(-100);
  }

  saveState(state);

  return category;
}

// Get the next store for store-guide category
export function getNextStore() {
  const state = loadState();
  const stores = config.stores;

  const store = stores[state.storeIndex % stores.length];

  state.storeIndex = (state.storeIndex + 1) % stores.length;
  saveState(state);

  return store;
}

// Get the next topic index for a category (to avoid repeating topics)
export function getNextTopicIndex(category, maxTopics) {
  const state = loadState();

  if (!state.topicIndexes[category]) {
    state.topicIndexes[category] = 0;
  }

  const index = state.topicIndexes[category] % maxTopics;
  state.topicIndexes[category] = (state.topicIndexes[category] + 1) % maxTopics;

  saveState(state);

  return index;
}

// Get rotation statistics
export function getRotationStats() {
  const state = loadState();

  const categoryCounts = {};
  for (const entry of state.categoryHistory) {
    categoryCounts[entry.category] = (categoryCounts[entry.category] || 0) + 1;
  }

  return {
    totalGenerated: state.categoryHistory.length,
    currentIndex: state.currentIndex,
    storeIndex: state.storeIndex,
    categoryCounts,
    lastCategory: state.lastCategory
  };
}

// Reset the rotation (for testing)
export function resetRotation() {
  const state = {
    currentIndex: 0,
    lastCategory: null,
    categoryHistory: [],
    storeIndex: 0,
    topicIndexes: {}
  };
  saveState(state);
}
