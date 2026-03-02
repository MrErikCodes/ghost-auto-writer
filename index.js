#!/usr/bin/env node

import { Command } from 'commander';
import { config } from './config.js';
import { testConnection, createPost } from './ghost-client.js';
import { getNextCategory, getRotationStats } from './category-rotator.js';
import { getNextTopic } from './topic-scorer.js';
import { generateArticle } from './article-writer.js';
import { saveGeneratedTopic, getGeneratedStats, loadGeneratedTopics } from './generated-topics.js';
import { researchAgent } from './research-agent.js';
import {
  startBatchGeneration,
  checkBatchStatus,
  listBatches,
  downloadBatchResults,
  parseArticleFromResult,
  loadTopicMapping,
  cancelBatch
} from './batch-writer.js';
import { parseIdeasFile, ideasToTopics } from './ideas-parser.js';
import { SiteAnalyzer } from './site-analyzer.js';
import {
  prepareBatch as claudePrepareBatch,
  runBatch as claudeRunBatch,
  runTurbo as claudeRunTurbo,
  getBatchStatus as claudeGetBatchStatus,
  loadBatchResults as claudeLoadBatchResults,
  loadBatchMapping as claudeLoadBatchMapping,
  generateFastTopics
} from './claude-writer.js';
import { fetchAll as fetchGscData } from './search-console-client.js';
import {
  getArticleHealth,
  printHealthReport,
  unpublishDeadArticles,
  rewriteDeadArticles
} from './article-health.js';

const program = new Command();

program
  .name('blog-generator')
  .description('AI-powered blog generator for minekvitteringer.no')
  .version('1.0.0');

program
  .command('generate')
  .description('Generate blog articles')
  .option('-c, --count <number>', 'Number of articles to generate', '1')
  .option('-d, --dryrun', 'Generate without posting to Ghost')
  .option('-a, --autopost', 'Publish immediately instead of draft')
  .option('--bypass-duplicates', 'Skip duplicate checking (allow regenerating same topics)')
  .action(async (options) => {
    const count = parseInt(options.count);
    const dryRun = !!options.dryrun;
    const autoPost = !!options.autopost;
    const bypassDuplicates = !!options.bypassDuplicates;

    console.log(`\n🚀 Starting blog generator for ${config.siteName}`);
    console.log(`📝 Generating ${count} article(s)...`);
    if (bypassDuplicates) {
      console.log(`⚠ BYPASS DUPLICATES - duplicate checking disabled\n`);
    }
    if (dryRun) {
      console.log(`🔸 DRY RUN MODE - will not post to Ghost\n`);
    } else if (autoPost) {
      console.log(`🚀 AUTO-POST MODE - will publish immediately\n`);
    } else {
      console.log(`📋 DRAFT MODE - will save as drafts\n`);
    }

    // Test Ghost connection first (unless dry run)
    if (!dryRun) {
      const connected = await testConnection();
      if (!connected) {
        console.error('❌ Could not connect to Ghost. Check your API credentials.');
        process.exit(1);
      }
    }

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < count; i++) {
      console.log(`\n--- Article ${i + 1} of ${count} ---`);

      try {
        // Get next category in rotation
        const category = getNextCategory();
        console.log(`📂 Category: ${category}`);

        // Get topic for this category
        const topicInfo = await getNextTopic(category, { bypassDuplicates });
        console.log(`💡 Topic: ${topicInfo.topic || topicInfo.title || topicInfo.query || 'Auto-generated'}`);

        // Generate article
        const article = await generateArticle(category, topicInfo);

        if (dryRun) {
          console.log(`✅ [DRY RUN] Would post: ${article.title}`);
          console.log(`📄 Meta: ${article.metaDescription}`);
          console.log(`📝 Excerpt: ${article.excerpt}`);
        } else {
          // Post to Ghost (draft or published based on autoPost flag)
          const post = await createPost(article, autoPost);
          const status = autoPost ? '🌐 Published' : '📋 Draft saved';
          console.log(`${status}: ${post.title}`);
          console.log(`🔗 ${autoPost ? 'View' : 'Edit'}: ${config.ghostApiUrl.replace('/ghost/api/admin/', autoPost ? '/' : '/ghost/#/editor/post/')}${autoPost ? post.slug : post.id}`);
        }

        // Save to generated topics
        await saveGeneratedTopic({
          ...topicInfo,
          title: article.title,
          ghostPostId: dryRun ? null : article.id
        });

        successCount++;
      } catch (error) {
        console.error(`❌ Failed: ${error.message}`);
        failCount++;
      }

      // Delay between articles
      if (i < count - 1) {
        console.log('\n⏳ Waiting before next article...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log(`\n========================================`);
    console.log(`✅ Success: ${successCount} articles`);
    console.log(`❌ Failed: ${failCount} articles`);
    console.log(`========================================\n`);
  });

program
  .command('stats')
  .description('Show generation statistics')
  .action(async () => {
    console.log('\n📊 Blog Generator Statistics\n');

    const rotationStats = getRotationStats();
    const generatedStats = await getGeneratedStats();

    console.log('ROTATION:');
    console.log(`  Current index: ${rotationStats.currentIndex}`);
    console.log(`  Last category: ${rotationStats.lastCategory || 'None'}`);
    console.log(`  Category distribution:`);
    for (const [cat, count] of Object.entries(rotationStats.categoryCounts)) {
      console.log(`    - ${cat}: ${count}`);
    }

    console.log('\nGENERATED CONTENT:');
    console.log(`  Total articles: ${generatedStats.total}`);
    console.log(`  Last 7 days: ${generatedStats.last7Days}`);
    console.log(`  By category:`);
    for (const [cat, count] of Object.entries(generatedStats.byCategory)) {
      console.log(`    - ${cat}: ${count}`);
    }

    if (generatedStats.lastGenerated) {
      console.log(`\n  Last generated:`);
      console.log(`    - Title: ${generatedStats.lastGenerated.title || 'N/A'}`);
      console.log(`    - Category: ${generatedStats.lastGenerated.category || 'N/A'}`);
      console.log(`    - Date: ${generatedStats.lastGenerated.generatedAt || 'N/A'}`);
    }

    console.log('');
  });

program
  .command('test-connection')
  .description('Test Ghost CMS connection')
  .action(async () => {
    console.log('\n🔌 Testing Ghost connection...\n');
    const connected = await testConnection();
    if (connected) {
      console.log('✅ Connection successful!\n');
    } else {
      console.log('❌ Connection failed. Check your .env settings.\n');
      process.exit(1);
    }
  });

program
  .command('preview')
  .description('Preview what topics would be generated')
  .option('-c, --count <number>', 'Number of topics to preview', '5')
  .action(async (options) => {
    const count = parseInt(options.count);
    console.log(`\n👀 Previewing next ${count} topics:\n`);

    for (let i = 0; i < count; i++) {
      const category = getNextCategory();
      const topicInfo = await getNextTopic(category);

      console.log(`${i + 1}. [${category}]`);
      console.log(`   Topic: ${topicInfo.topic || topicInfo.query}`);
      if (topicInfo.store) console.log(`   Store: ${topicInfo.store}`);
      if (topicInfo.impressions) console.log(`   Impressions: ${topicInfo.impressions}`);
      console.log('');
    }
  });

// Research commands
program
  .command('research')
  .description('Run AI research agent to find trending topics')
  .option('-f, --focus <topic>', 'Focus on specific topic (e.g., "phones", "tvs")')
  .action(async (options) => {
    console.log('\n🧠 Starting Research Agent...\n');

    // Load previous topics for awareness
    const previousTopics = await loadGeneratedTopics();
    console.log(`📚 Found ${previousTopics.length} previously generated articles\n`);

    if (options.focus) {
      // Research specific category
      const categories = ['phones', 'tvs', 'laptops', 'appliances', 'gaming', 'wearables', 'audio', 'homeAndGarden'];
      if (categories.includes(options.focus)) {
        const result = await researchAgent.researchCategory(options.focus);
        if (result) {
          console.log('\n📊 Research Results:\n');
          console.log(`Category: ${result.category}`);
          console.log(`\nTop Products:`);
          result.topProducts?.forEach((p, i) => {
            console.log(`  ${i + 1}. ${p.name} (${p.priceRange})`);
          });
          console.log(`\nArticle Ideas:`);
          result.articleIdeas?.forEach((a, i) => {
            console.log(`  ${i + 1}. ${a.title}`);
          });
          console.log(`\nMarket Insights: ${result.marketInsights}`);
        }
      } else {
        // General research with focus
        const result = await researchAgent.research(options.focus, 10, previousTopics);
        if (result) {
          printResearchResults(result);
        }
      }
    } else {
      // General research
      const result = await researchAgent.research(null, 10, previousTopics);
      if (result) {
        printResearchResults(result);
      }
    }
  });

program
  .command('brain')
  .description('Show research agent brain/memory summary')
  .action(async () => {
    researchAgent.printBrainSummary();
  });

program
  .command('suggest')
  .description('Generate smart topic suggestions based on research')
  .option('-c, --count <number>', 'Number of suggestions', '5')
  .action(async (options) => {
    const count = parseInt(options.count);
    const topics = await researchAgent.generateSmartTopics(count);

    if (topics.length > 0) {
      console.log('\n💡 Smart Topic Suggestions:\n');
      topics.forEach((topic, i) => {
        console.log(`${i + 1}. ${topic.title}`);
        console.log(`   Keyword: ${topic.primaryKeyword}`);
        console.log(`   Category: ${topic.category}`);
        console.log(`   Priority: ${topic.priority}`);
        console.log(`   ${topic.description}\n`);
      });
    } else {
      console.log('\n❌ Could not generate suggestions. Try running "research" first.\n');
    }
  });

program
  .command('smart-generate')
  .description('Run research + generate articles (auto-uses Batch API for 10+ articles)')
  .option('-c, --count <number>', 'Number of articles to generate', '5')
  .option('-a, --autopost', 'Publish immediately instead of draft')
  .option('--no-batch', 'Force real-time generation even for 10+ articles')
  .option('--bypass-duplicates', 'Skip duplicate checking (allow regenerating same topics)')
  .action(async (options) => {
    const count = parseInt(options.count);
    const autoPost = !!options.autopost;
    const useBatch = options.batch !== false && count >= 10;
    const bypassDuplicates = !!options.bypassDuplicates;

    console.log('\n🚀 SMART GENERATE MODE');
    console.log('='.repeat(40));
    if (useBatch) {
      console.log(`📦 BATCH MODE (50% discount!) - ${count} articles`);
    } else {
      console.log(`⚡ REAL-TIME MODE - ${count} articles`);
    }
    if (bypassDuplicates) {
      console.log(`⚠ BYPASS DUPLICATES - duplicate checking disabled`);
    }
    console.log('');

    // Step 1: Load previously generated topics to avoid duplicates
    let previousTopics = bypassDuplicates ? [] : await loadGeneratedTopics();
    if (!bypassDuplicates) {
      console.log(`📚 Found ${previousTopics.length} previously generated articles\n`);
    }

    // Step 2: Collect unique ideas - keep generating until we have enough
    let uniqueIdeas = [];
    let rejectedIdeas = []; // Track ideas that were filtered out (so AI doesn't suggest them again)
    let attempts = 0;
    const maxAttempts = 5; // Increased from 3 to give more chances

    while (uniqueIdeas.length < count && attempts < maxAttempts) {
      attempts++;
      const neededCount = count - uniqueIdeas.length;

      console.log(`\n🔄 Research round ${attempts}: Looking for ${neededCount}${bypassDuplicates ? '' : ' unique'} ideas...\n`);

      // Request extra ideas to account for potential duplicates
      // On later rounds, ask for even more ideas since we know there are many duplicates
      const multiplier = bypassDuplicates ? 1 : (attempts === 1 ? 2 : 3);
      const requestCount = bypassDuplicates ? neededCount : Math.max(neededCount * multiplier, 15);

      // Combine previousTopics + rejectedIdeas so the AI knows what to avoid
      const allToAvoid = bypassDuplicates ? [] : [
        ...previousTopics,
        ...rejectedIdeas.map(title => ({ title, topic: title }))
      ];

      const research = await researchAgent.research(null, requestCount, allToAvoid, attempts);

      if (!research || !research.articleIdeas?.length) {
        console.log('⚠ Research returned no ideas this round');
        continue;
      }

      if (attempts === 1) {
        printResearchResults(research);
      }

      if (bypassDuplicates) {
        // Skip duplicate filtering entirely
        uniqueIdeas = [...uniqueIdeas, ...research.articleIdeas];
        console.log(`✅ Got ${research.articleIdeas.length} ideas this round (duplicate check bypassed)`);
      } else {
        // Filter out duplicates (against both previous topics AND ideas we already collected)
        const allExisting = [...previousTopics, ...uniqueIdeas.map(i => ({ title: i.title, query: i.primaryKeyword, topic: i.title }))];
        const { unique: newUniqueIdeas, rejected } = filterUniqueIdeas(research.articleIdeas, allExisting);

        // Track rejected ideas so AI won't suggest them again
        rejectedIdeas = [...rejectedIdeas, ...rejected.map(r => r.title)];

        console.log(`✅ Found ${newUniqueIdeas.length} new unique ideas this round`);

        // Add new unique ideas to our collection
        uniqueIdeas = [...uniqueIdeas, ...newUniqueIdeas];
      }

      // If we got some ideas but not enough, we'll loop again
      if (uniqueIdeas.length < count && attempts < maxAttempts) {
        console.log(`📊 Total ideas so far: ${uniqueIdeas.length}/${count} - generating more...`);
      }
    }

    // Trim to requested count
    uniqueIdeas = uniqueIdeas.slice(0, count);

    console.log(`\n🎯 Final result: ${uniqueIdeas.length} unique ideas ready to generate\n`);

    if (uniqueIdeas.length === 0) {
      console.log('❌ Could not find any unique ideas after multiple attempts. Try a different focus.\n');
      return;
    }

    // Prepare topics
    const topics = uniqueIdeas.map(idea => ({
      category: idea.category || 'seo-gap',
      topic: idea.title,
      query: idea.primaryKeyword,
      keywords: idea.keywords,
      dataSource: idea.dataSource,
      rationale: idea.rationale
    }));

    // ========================================
    // BATCH MODE (10+ articles, 50% discount)
    // ========================================
    if (useBatch) {
      console.log('📦 Using OpenAI Batch API (50% discount, results within 24h)...\n');
      await startBatchGeneration(topics, autoPost);
      return;
    }

    // ========================================
    // REAL-TIME MODE (< 10 articles)
    // ========================================
    console.log(`Step 2: Generating ${uniqueIdeas.length} articles in real-time...\n`);

    // Test Ghost connection
    const connected = await testConnection();
    if (!connected) {
      console.error('❌ Could not connect to Ghost.');
      return;
    }

    let successCount = 0;

    for (let i = 0; i < topics.length; i++) {
      const topicInfo = topics[i];
      console.log(`\n--- Article ${i + 1}/${topics.length} ---`);
      console.log(`Topic: ${topicInfo.topic}`);
      console.log(`Keyword: ${topicInfo.query}`);
      if (topicInfo.dataSource === 'ai-creative') {
        console.log(`🎨 Type: AI Creative`);
      }

      try {
        const article = await generateArticle(topicInfo.category, topicInfo);

        const post = await createPost(article, autoPost);
        const status = autoPost ? '🌐 Published' : '📋 Draft saved';
        console.log(`${status}: ${post.title}`);

        await saveGeneratedTopic({
          ...topicInfo,
          title: article.title,
          ghostPostId: post.id
        });

        successCount++;

        // Delay between articles
        if (i < topics.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        console.error(`❌ Failed: ${error.message}`);
      }
    }

    console.log(`\n${'='.repeat(40)}`);
    console.log(`✅ Smart Generate Complete: ${successCount}/${topics.length} articles`);
    console.log('='.repeat(40) + '\n');
  });

// ============================================
// BATCH MANAGEMENT COMMANDS
// ============================================

program
  .command('batch-status')
  .description('Check status of a batch job')
  .argument('[batchId]', 'Batch ID to check (omit to list recent batches)')
  .action(async (batchId) => {
    if (batchId) {
      await checkBatchStatus(batchId);
    } else {
      await listBatches();
    }
  });

program
  .command('batch-list')
  .description('List recent batch jobs')
  .option('-l, --limit <number>', 'Number of batches to show', '10')
  .action(async (options) => {
    await listBatches(parseInt(options.limit));
  });

program
  .command('batch-process')
  .description('Download batch results and post articles to Ghost')
  .argument('<batchId>', 'Batch ID to process')
  .option('-a, --autopost', 'Publish immediately instead of draft')
  .action(async (batchId, options) => {
    const autoPost = !!options.autopost;

    console.log('\n📥 PROCESSING BATCH RESULTS');
    console.log('='.repeat(40));

    // Check batch status first
    const batch = await checkBatchStatus(batchId);

    if (batch.status !== 'completed') {
      console.log(`\n⏳ Batch not ready yet. Status: ${batch.status}`);
      console.log('   Run this command again when status is "completed".\n');
      return;
    }

    // Download results
    const results = await downloadBatchResults(batchId);

    // Load topic mapping
    const mapping = loadTopicMapping(batchId);

    // Test Ghost connection
    const connected = await testConnection();
    if (!connected) {
      console.error('❌ Could not connect to Ghost.');
      return;
    }

    console.log(`\n📝 Processing ${results.length} articles...\n`);

    let successCount = 0;
    let failCount = 0;

    for (const result of results) {
      const article = parseArticleFromResult(result);

      if (!article) {
        failCount++;
        continue;
      }

      try {
        // Find original topic from mapping
        const topicEntry = mapping?.topics?.find(t => t.custom_id === result.custom_id);
        const topicInfo = topicEntry?.topic || {};

        // Post to Ghost
        const post = await createPost(article, autoPost);
        const status = autoPost ? '🌐 Published' : '📋 Draft saved';
        console.log(`${status}: ${article.title}`);

        // Save to generated topics
        await saveGeneratedTopic({
          ...topicInfo,
          title: article.title,
          ghostPostId: post.id,
          batchId: batchId
        });

        successCount++;
      } catch (error) {
        console.error(`❌ Failed to post "${article.title}": ${error.message}`);
        failCount++;
      }
    }

    console.log(`\n${'='.repeat(40)}`);
    console.log(`✅ Batch Processing Complete`);
    console.log(`   Success: ${successCount} articles`);
    console.log(`   Failed: ${failCount} articles`);
    console.log('='.repeat(40) + '\n');
  });

program
  .command('batch-cancel')
  .description('Cancel a running batch job')
  .argument('<batchId>', 'Batch ID to cancel')
  .action(async (batchId) => {
    await cancelBatch(batchId);
  });

// ============================================
// FROM-FILE COMMAND (custom ideas)
// ============================================

program
  .command('from-file')
  .description('Generate articles from a custom ideas file (skips research agent)')
  .argument('<file>', 'Path to ideas file (e.g. ideas.txt)')
  .option('-c, --count <number>', 'Number of ideas to generate (default: all)')
  .option('--start <number>', 'Start from idea N (1-based)', '1')
  .option('-a, --autopost', 'Publish immediately instead of draft')
  .option('-d, --dryrun', 'Generate without posting to Ghost')
  .option('--no-batch', 'Force real-time generation even for 10+ articles')
  .action(async (file, options) => {
    const start = parseInt(options.start) - 1; // Convert to 0-based
    const autoPost = !!options.autopost;
    const dryRun = !!options.dryrun;

    console.log('\n📄 FROM-FILE MODE');
    console.log('='.repeat(40));
    console.log(`File: ${file}\n`);

    // Parse ideas file
    let ideas;
    try {
      ideas = parseIdeasFile(file);
    } catch (error) {
      console.error(`❌ ${error.message}`);
      process.exit(1);
    }

    console.log(`📋 Parsed ${ideas.length} ideas from file`);

    // Apply start offset
    if (start > 0) {
      ideas = ideas.slice(start);
      console.log(`⏩ Starting from idea ${start + 1}`);
    }

    // Apply count limit
    if (options.count) {
      const count = parseInt(options.count);
      ideas = ideas.slice(0, count);
    }

    if (ideas.length === 0) {
      console.log('❌ No ideas to generate after applying filters.\n');
      return;
    }

    // Show what will be generated
    console.log(`\n🎯 Generating ${ideas.length} article(s):\n`);
    ideas.forEach((idea, i) => {
      console.log(`  ${i + 1}. [${idea.category}] ${idea.title}`);
      console.log(`     Keyword: ${idea.keyword}`);
    });
    console.log('');

    // Convert to topics
    const topics = ideasToTopics(ideas);

    const useBatch = options.batch !== false && topics.length >= 10;

    if (dryRun) {
      console.log('🔸 DRY RUN - would generate these articles but not posting.\n');
      return;
    }

    // ========================================
    // BATCH MODE (10+ articles, 50% discount)
    // ========================================
    if (useBatch) {
      console.log('📦 Using OpenAI Batch API (50% discount, results within 24h)...\n');
      await startBatchGeneration(topics, autoPost);
      return;
    }

    // ========================================
    // REAL-TIME MODE (< 10 articles)
    // ========================================
    console.log(`⚡ Real-time generation for ${topics.length} article(s)...\n`);

    // Test Ghost connection
    const connected = await testConnection();
    if (!connected) {
      console.error('❌ Could not connect to Ghost.');
      return;
    }

    let successCount = 0;

    for (let i = 0; i < topics.length; i++) {
      const topicInfo = topics[i];
      console.log(`\n--- Article ${i + 1}/${topics.length} ---`);
      console.log(`Topic: ${topicInfo.topic}`);
      console.log(`Keyword: ${topicInfo.query}`);

      try {
        const article = await generateArticle(topicInfo.category, topicInfo);

        const post = await createPost(article, autoPost);
        const status = autoPost ? '🌐 Published' : '📋 Draft saved';
        console.log(`${status}: ${post.title}`);

        await saveGeneratedTopic({
          ...topicInfo,
          title: article.title,
          ghostPostId: post.id
        });

        successCount++;

        if (i < topics.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        console.error(`❌ Failed: ${error.message}`);
      }
    }

    console.log(`\n${'='.repeat(40)}`);
    console.log(`✅ From-File Complete: ${successCount}/${topics.length} articles`);
    console.log('='.repeat(40) + '\n');
  });

// ============================================
// DATA-DRIVEN COMMANDS
// ============================================

program
  .command('analyze')
  .description('Analyze blog performance: cross-reference Ghost posts with Search Console data')
  .action(async () => {
    console.log('\n  SITE ANALYSIS');
    console.log('='.repeat(40));

    const analyzer = new SiteAnalyzer();
    await analyzer.analyze();
    analyzer.printReport();
  });

program
  .command('data-generate')
  .description('Generate articles based on data analysis of what performs best')
  .option('-c, --count <number>', 'Number of articles to generate', '5')
  .option('-d, --dryrun', 'Generate without posting to Ghost')
  .option('-a, --autopost', 'Publish immediately instead of draft')
  .option('--no-batch', 'Force real-time generation even for 10+ articles')
  .action(async (options) => {
    const count = parseInt(options.count);
    const dryRun = !!options.dryrun;
    const autoPost = !!options.autopost;
    const useBatch = options.batch !== false && count >= 10;

    console.log('\n  DATA-DRIVEN GENERATE');
    console.log('='.repeat(40));
    console.log(`  Generating ${count} article(s) based on performance data\n`);
    if (dryRun) console.log('  DRY RUN MODE - will not post to Ghost\n');

    // Step 1: Analyze the site
    console.log('Step 1: Analyzing site performance...');
    const analyzer = new SiteAnalyzer();
    await analyzer.analyze();

    if (analyzer.topPerformers.length === 0) {
      console.log('\n  No performance data found. Run "analyze" first to check data.\n');
      return;
    }

    // Print brief summary
    console.log(`\n  Top themes: ${analyzer.doubleDownOpportunities.slice(0, 3).map(t => t.theme).join(', ')}`);
    console.log(`  Top performer: "${analyzer.topPerformers[0]?.title}" (${analyzer.topPerformers[0]?.clicks} clicks)\n`);

    // Step 2: Generate topic suggestions
    console.log('Step 2: AI generating topic suggestions from analysis...\n');
    const suggestions = await analyzer.generateTopicSuggestions(count * 2); // Request extra to account for filtering

    if (suggestions.length === 0) {
      console.log('  Could not generate topic suggestions.\n');
      return;
    }

    console.log(`  Got ${suggestions.length} suggestions from AI`);
    suggestions.forEach((s, i) => {
      console.log(`  ${i + 1}. "${s.title}" [${s.priority}] - ${s.basedOn}`);
    });

    // Step 3: Filter duplicates
    console.log('\nStep 3: Filtering duplicates...');
    const previousTopics = await loadGeneratedTopics();
    const { unique: uniqueSuggestions } = filterUniqueIdeas(
      suggestions.map(s => ({ title: s.title, primaryKeyword: s.primaryKeyword })),
      previousTopics
    );

    const finalSuggestions = suggestions
      .filter(s => uniqueSuggestions.some(u => u.title === s.title))
      .slice(0, count);

    console.log(`  ${finalSuggestions.length} unique ideas ready to generate\n`);

    if (finalSuggestions.length === 0) {
      console.log('  No unique ideas after filtering. All suggestions match existing content.\n');
      return;
    }

    // Convert to topics
    const topics = finalSuggestions.map(s => ({
      category: 'data-driven',
      topic: s.title,
      query: s.primaryKeyword,
      keywords: s.targetQueries || [],
      dataSource: 'data-driven',
      rationale: s.rationale,
      analysisContext: {
        basedOn: s.basedOn,
        targetQueries: s.targetQueries,
        contentAngle: s.contentAngle,
        topPerformerExample: s.topPerformerExample,
        rationale: s.rationale
      }
    }));

    // Step 4: Generate articles
    if (useBatch) {
      console.log('Step 4: Using Batch API (50% discount)...\n');
      await startBatchGeneration(topics, autoPost);
      return;
    }

    console.log(`Step 4: Generating ${topics.length} article(s) in real-time...\n`);

    if (!dryRun) {
      const connected = await testConnection();
      if (!connected) {
        console.error('  Could not connect to Ghost.');
        return;
      }
    }

    let successCount = 0;

    for (let i = 0; i < topics.length; i++) {
      const topicInfo = topics[i];
      console.log(`\n--- Article ${i + 1}/${topics.length} ---`);
      console.log(`Topic: ${topicInfo.topic}`);
      console.log(`Keyword: ${topicInfo.query}`);
      console.log(`Based on: ${topicInfo.analysisContext?.basedOn || 'N/A'}`);

      try {
        const article = await generateArticle(topicInfo.category, topicInfo);

        if (dryRun) {
          console.log(`  [DRY RUN] Would post: ${article.title}`);
          console.log(`  Meta: ${article.metaDescription}`);
        } else {
          const post = await createPost(article, autoPost);
          const status = autoPost ? '  Published' : '  Draft saved';
          console.log(`${status}: ${post.title}`);
        }

        await saveGeneratedTopic({
          ...topicInfo,
          title: article.title,
          ghostPostId: dryRun ? null : undefined
        });

        successCount++;

        if (i < topics.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        console.error(`  Failed: ${error.message}`);
      }
    }

    console.log(`\n${'='.repeat(40)}`);
    console.log(`  Data-Driven Generate Complete: ${successCount}/${topics.length} articles`);
    console.log('='.repeat(40) + '\n');
  });

// Filter out ideas that are similar to already-generated content
// Returns { unique: [...], rejected: [...] } so caller can track rejected ideas
function filterUniqueIdeas(ideas, previousTopics, verbose = false) {
  const rejected = [];
  const unique = ideas.filter(idea => {
    // Check against all previous topics
    for (const prev of previousTopics) {
      // Check title similarity
      if (isSimilar(idea.title, prev.title)) {
        rejected.push({ title: idea.title, reason: 'similar title', match: prev.title });
        return false;
      }
      // Check primary keyword similarity
      if (idea.primaryKeyword && prev.query && isSimilar(idea.primaryKeyword, prev.query)) {
        rejected.push({ title: idea.title, reason: 'similar keyword', match: prev.query });
        return false;
      }
      // Check topic similarity
      if (idea.title && prev.topic && isSimilar(idea.title, prev.topic)) {
        rejected.push({ title: idea.title, reason: 'similar topic', match: prev.topic });
        return false;
      }
    }
    return true;
  });

  // Log summary of rejected items
  if (rejected.length > 0 && verbose) {
    console.log(`  ⚠ Skipped ${rejected.length} duplicates:`);
    rejected.forEach(s => console.log(`    - "${s.title.substring(0, 50)}..." (${s.reason})`));
  } else if (rejected.length > 0) {
    console.log(`  ⚠ Filtered out ${rejected.length} duplicate ideas`);
  }

  return { unique, rejected };
}

// Check if two strings are similar (fuzzy matching)
function isSimilar(str1, str2) {
  if (!str1 || !str2) return false;

  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  // Exact match
  if (s1 === s2) return true;

  // Only block if one fully contains the other (and they're long enough to be meaningful)
  if (s1.length > 15 && s2.length > 15 && (s1.includes(s2) || s2.includes(s1))) return true;

  // Extract key words (remove common words)
  const stopWords = ['slik', 'hvordan', 'hva', 'er', 'for', 'og', 'i', 'på', 'til', 'med', 'som', 'en', 'et', 'de', 'den', 'det', 'av', 'har', 'kan', 'din', 'dine', 'du', 'deg'];

  const getKeywords = (str) => {
    return str.split(/[\s\-:,]+/)
      .filter(w => w.length > 2 && !stopWords.includes(w))
      .sort();
  };

  const keywords1 = getKeywords(s1);
  const keywords2 = getKeywords(s2);

  // Count matching keywords
  const matches = keywords1.filter(k1 => keywords2.some(k2 => k1 === k2 || k1.includes(k2) || k2.includes(k1)));

  // Only block near-exact matches (90%+ keyword overlap) - similar topics are fine for SEO
  const similarity = matches.length / Math.min(keywords1.length, keywords2.length);
  return similarity >= 0.9;
}

function printResearchResults(result) {
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESEARCH RESULTS (basert på ekte data)');
  console.log('='.repeat(60) + '\n');

  if (result.articleIdeas?.length > 0) {
    console.log('💡 ARTIKKELIDEER (prioritert etter data):');
    console.log('-'.repeat(40));
    result.articleIdeas.forEach((a, i) => {
      console.log(`\n  ${i + 1}. ${a.title}`);
      console.log(`     📌 Hovedsøkeord: ${a.primaryKeyword || 'N/A'}`);
      console.log(`     🏷️  Kategori: ${a.category}`);
      console.log(`     ⭐ Prioritet: ${a.priority}`);
      console.log(`     📊 Datakilde: ${a.dataSource || 'AI-analyse'}`);
      if (a.rationale) console.log(`     💭 Begrunnelse: ${a.rationale}`);
    });
    console.log('');
  }

  if (result.aiCreativeIdeas?.length > 0) {
    console.log('🎨 AI-KREATIVE IDEER (AI sin egen kreativitet):');
    console.log('-'.repeat(40));
    result.aiCreativeIdeas.forEach((a, i) => {
      console.log(`\n  ${i + 1}. ${a.title}`);
      console.log(`     📌 Foreslått søkeord: ${a.primaryKeyword || 'N/A'}`);
      console.log(`     🎯 Vinkel: ${a.angle || 'N/A'}`);
      console.log(`     💭 Hvorfor dette fungerer: ${a.whyThisWorks || 'N/A'}`);
    });
    console.log('');
  }

  if (result.seoGaps?.length > 0) {
    console.log('🎯 SEO-GAPS (muligheter fra Search Console):');
    console.log('-'.repeat(40));
    result.seoGaps.forEach((g, i) => {
      console.log(`\n  ${i + 1}. "${g.keyword}"`);
      console.log(`     📈 Visninger: ${g.impressions} | Posisjon: ${g.currentPosition}`);
      console.log(`     📝 Foreslått tittel: ${g.suggestedTitle}`);
      if (g.opportunity) console.log(`     💡 Mulighet: ${g.opportunity}`);
    });
    console.log('');
  }

  if (result.trendingTopics?.length > 0) {
    console.log('🔥 TRENDING TOPICS (fra Google Trends):');
    console.log('-'.repeat(40));
    result.trendingTopics.forEach((t, i) => {
      console.log(`\n  ${i + 1}. ${t.topic}`);
      console.log(`     🔗 Relevans: ${t.relevance}`);
      if (t.risingQueries?.length > 0) {
        console.log(`     📈 Rising queries: ${t.risingQueries.join(', ')}`);
      }
    });
    console.log('');
  }

  if (result.seasonalInsights) {
    console.log('📅 SESONG-MULIGHETER:');
    console.log('-'.repeat(40));
    console.log(`  Måned: ${result.seasonalInsights.currentMonth}`);
    if (result.seasonalInsights.opportunities?.length > 0) {
      console.log(`  Muligheter: ${result.seasonalInsights.opportunities.join(', ')}`);
    }
    if (result.seasonalInsights.upcomingEvents?.length > 0) {
      console.log(`  Kommende events: ${result.seasonalInsights.upcomingEvents.join(', ')}`);
    }
    console.log('');
  }

  if (result.dataInsights) {
    console.log('🧠 AI-INNSIKT:');
    console.log('-'.repeat(40));
    if (result.dataInsights.topPerformingThemes?.length > 0) {
      console.log(`  Beste temaer: ${result.dataInsights.topPerformingThemes.join(', ')}`);
    }
    if (result.dataInsights.emergingTopics?.length > 0) {
      console.log(`  Nye trender: ${result.dataInsights.emergingTopics.join(', ')}`);
    }
    if (result.dataInsights.recommendations?.length > 0) {
      console.log(`  Anbefalinger:`);
      result.dataInsights.recommendations.forEach((r, i) => {
        console.log(`    ${i + 1}. ${r}`);
      });
    }
    console.log('');
  }

  console.log('='.repeat(60) + '\n');
}

// ============================================
// CLAUDE CLI COMMANDS
// ============================================

program
  .command('claude-generate')
  .description('Generate articles using Claude CLI (uses your Claude subscription, no API costs)')
  .option('-c, --count <number>', 'Number of articles to generate', '5')
  .option('-d, --dryrun', 'Prepare prompts only, do not run Claude')
  .option('-a, --autopost', 'Publish immediately instead of draft')
  .option('--parallel <number>', 'Number of parallel Claude processes', '3')
  .option('--model <model>', 'Claude model to use', 'sonnet')
  .option('--bypass-duplicates', 'Skip duplicate checking')
  .option('--view', 'Stream Claude subprocess output to terminal (see it thinking)')
  .action(async (options) => {
    const count = parseInt(options.count);
    const dryRun = !!options.dryrun;
    const autoPost = !!options.autopost;
    const parallel = parseInt(options.parallel);
    const model = options.model;
    const bypassDuplicates = !!options.bypassDuplicates;
    const view = !!options.view;

    console.log('\n🤖 CLAUDE CLI GENERATE');
    console.log('='.repeat(40));
    console.log(`Articles: ${count} | Model: ${model} | Parallel: ${parallel}${view ? ' | VIEW MODE' : ''}`);
    if (dryRun) console.log('🔸 DRY RUN - will prepare prompts only');
    if (bypassDuplicates) console.log('⚠ BYPASS DUPLICATES enabled');
    console.log('');

    // Step 1: Research
    let previousTopics = bypassDuplicates ? [] : await loadGeneratedTopics();
    if (!bypassDuplicates) {
      console.log(`📚 Found ${previousTopics.length} previously generated articles\n`);
    }

    let uniqueIdeas = [];
    let rejectedIdeas = [];
    let attempts = 0;
    const maxAttempts = 5;

    while (uniqueIdeas.length < count && attempts < maxAttempts) {
      attempts++;
      const neededCount = count - uniqueIdeas.length;
      console.log(`\n🔄 Research round ${attempts}: Looking for ${neededCount}${bypassDuplicates ? '' : ' unique'} ideas...\n`);

      const multiplier = bypassDuplicates ? 1 : (attempts === 1 ? 2 : 3);
      const requestCount = bypassDuplicates ? neededCount : Math.max(neededCount * multiplier, 15);

      const allToAvoid = bypassDuplicates ? [] : [
        ...previousTopics,
        ...rejectedIdeas.map(title => ({ title, topic: title }))
      ];

      const research = await researchAgent.research(null, requestCount, allToAvoid, attempts);

      if (!research || !research.articleIdeas?.length) {
        console.log('⚠ Research returned no ideas this round');
        continue;
      }

      if (attempts === 1) printResearchResults(research);

      if (bypassDuplicates) {
        uniqueIdeas = [...uniqueIdeas, ...research.articleIdeas];
        console.log(`✅ Got ${research.articleIdeas.length} ideas (duplicate check bypassed)`);
      } else {
        const allExisting = [...previousTopics, ...uniqueIdeas.map(i => ({ title: i.title, query: i.primaryKeyword, topic: i.title }))];
        const { unique: newUniqueIdeas, rejected } = filterUniqueIdeas(research.articleIdeas, allExisting);
        rejectedIdeas = [...rejectedIdeas, ...rejected.map(r => r.title)];
        console.log(`✅ Found ${newUniqueIdeas.length} new unique ideas this round`);
        uniqueIdeas = [...uniqueIdeas, ...newUniqueIdeas];
      }

      if (uniqueIdeas.length < count && attempts < maxAttempts) {
        console.log(`📊 Total: ${uniqueIdeas.length}/${count} - generating more...`);
      }
    }

    uniqueIdeas = uniqueIdeas.slice(0, count);
    console.log(`\n🎯 ${uniqueIdeas.length} ideas ready\n`);

    if (uniqueIdeas.length === 0) {
      console.log('❌ No unique ideas found.\n');
      return;
    }

    const topics = uniqueIdeas.map(idea => ({
      category: idea.category || 'seo-gap',
      topic: idea.title,
      query: idea.primaryKeyword,
      keywords: idea.keywords,
      dataSource: idea.dataSource,
      rationale: idea.rationale
    }));

    // Step 2: Prepare batch (write prompts to files)
    console.log('📁 Preparing Claude batch...');
    const batchDir = claudePrepareBatch(topics);

    if (dryRun) {
      console.log(`\n🔸 DRY RUN complete. Prompts saved to: ${batchDir}`);
      console.log(`\nTo run later:\n  node index.js claude-process ${batchDir}\n`);
      return;
    }

    // Step 3: Run batch (spawn claude processes)
    const { completed, failed } = await claudeRunBatch(batchDir, { parallel, model, view });

    if (completed === 0) {
      console.log('\n❌ No articles were generated.\n');
      return;
    }

    // Step 4: Post results to Ghost
    if (!autoPost && !dryRun) {
      console.log('\n📋 Posting articles to Ghost as drafts...\n');
    }

    const connected = await testConnection();
    if (!connected) {
      console.log('❌ Could not connect to Ghost. Results saved in batch dir.');
      console.log(`  Run later: node index.js claude-process ${batchDir} -a\n`);
      return;
    }

    const articles = claudeLoadBatchResults(batchDir);
    let postSuccess = 0;

    for (const article of articles) {
      try {
        const post = await createPost(article, autoPost);
        const status = autoPost ? '🌐 Published' : '📋 Draft saved';
        console.log(`  ${status}: ${post.title}`);

        await saveGeneratedTopic({
          ...article._topicInfo,
          title: article.title,
          ghostPostId: post.id
        });

        postSuccess++;
      } catch (error) {
        console.error(`  ❌ Failed to post "${article.title}": ${error.message}`);
      }
    }

    console.log(`\n${'='.repeat(40)}`);
    console.log(`✅ Claude Generate Complete`);
    console.log(`   Generated: ${completed} articles`);
    console.log(`   Posted: ${postSuccess} articles`);
    console.log(`   Failed: ${failed} generation(s)`);
    console.log('='.repeat(40) + '\n');
  });

program
  .command('claude-data-generate')
  .description('Data-driven article generation using Claude CLI (based on site performance analysis)')
  .option('-c, --count <number>', 'Number of articles to generate', '5')
  .option('-d, --dryrun', 'Prepare prompts only, do not run Claude')
  .option('-a, --autopost', 'Publish immediately instead of draft')
  .option('--parallel <number>', 'Number of parallel Claude processes', '3')
  .option('--model <model>', 'Claude model to use', 'sonnet')
  .option('--view', 'Stream Claude subprocess output to terminal (see it thinking)')
  .action(async (options) => {
    const count = parseInt(options.count);
    const dryRun = !!options.dryrun;
    const autoPost = !!options.autopost;
    const parallel = parseInt(options.parallel);
    const model = options.model;
    const view = !!options.view;

    console.log('\n🤖 CLAUDE CLI DATA-DRIVEN GENERATE');
    console.log('='.repeat(40));
    console.log(`Articles: ${count} | Model: ${model} | Parallel: ${parallel}`);
    if (dryRun) console.log('🔸 DRY RUN - will prepare prompts only');
    console.log('');

    // Step 1: Analyze site
    console.log('Step 1: Analyzing site performance...');
    const analyzer = new SiteAnalyzer();
    await analyzer.analyze();

    if (analyzer.topPerformers.length === 0) {
      console.log('\n❌ No performance data found. Run "analyze" first.\n');
      return;
    }

    console.log(`\n📈 Top themes: ${analyzer.doubleDownOpportunities.slice(0, 3).map(t => t.theme).join(', ')}`);
    console.log(`📈 Top performer: "${analyzer.topPerformers[0]?.title}" (${analyzer.topPerformers[0]?.clicks} clicks)\n`);

    // Step 2: Generate topic suggestions
    console.log('Step 2: AI generating topic suggestions...\n');
    const suggestions = await analyzer.generateTopicSuggestions(count * 2);

    if (suggestions.length === 0) {
      console.log('❌ Could not generate topic suggestions.\n');
      return;
    }

    console.log(`📝 Got ${suggestions.length} suggestions`);
    suggestions.forEach((s, i) => {
      console.log(`  ${i + 1}. "${s.title}" [${s.priority}] - ${s.basedOn}`);
    });

    // Step 3: Filter duplicates
    console.log('\nStep 3: Filtering duplicates...');
    const previousTopics = await loadGeneratedTopics();
    const { unique: uniqueSuggestions } = filterUniqueIdeas(
      suggestions.map(s => ({ title: s.title, primaryKeyword: s.primaryKeyword })),
      previousTopics
    );

    const finalSuggestions = suggestions
      .filter(s => uniqueSuggestions.some(u => u.title === s.title))
      .slice(0, count);

    console.log(`  ${finalSuggestions.length} unique ideas ready\n`);

    if (finalSuggestions.length === 0) {
      console.log('❌ No unique ideas after filtering.\n');
      return;
    }

    const topics = finalSuggestions.map(s => ({
      category: 'data-driven',
      topic: s.title,
      query: s.primaryKeyword,
      keywords: s.targetQueries || [],
      dataSource: 'data-driven',
      rationale: s.rationale,
      analysisContext: {
        basedOn: s.basedOn,
        targetQueries: s.targetQueries,
        contentAngle: s.contentAngle,
        topPerformerExample: s.topPerformerExample,
        rationale: s.rationale
      }
    }));

    // Step 4: Prepare and run Claude batch
    console.log('Step 4: Preparing Claude batch...');
    const batchDir = claudePrepareBatch(topics);

    if (dryRun) {
      console.log(`\n🔸 DRY RUN complete. Prompts saved to: ${batchDir}`);
      console.log(`\nTo run later:\n  node index.js claude-process ${batchDir}\n`);
      return;
    }

    const { completed, failed } = await claudeRunBatch(batchDir, { parallel, model, view });

    if (completed === 0) {
      console.log('\n❌ No articles were generated.\n');
      return;
    }

    // Post to Ghost
    const connected = await testConnection();
    if (!connected) {
      console.log('❌ Could not connect to Ghost. Results saved in batch dir.');
      console.log(`  Run later: node index.js claude-process ${batchDir} -a\n`);
      return;
    }

    const articles = claudeLoadBatchResults(batchDir);
    let postSuccess = 0;

    for (const article of articles) {
      try {
        const post = await createPost(article, autoPost);
        const status = autoPost ? '🌐 Published' : '📋 Draft saved';
        console.log(`  ${status}: ${post.title}`);

        await saveGeneratedTopic({
          ...article._topicInfo,
          title: article.title,
          ghostPostId: post.id
        });

        postSuccess++;
      } catch (error) {
        console.error(`  ❌ Failed to post "${article.title}": ${error.message}`);
      }
    }

    console.log(`\n${'='.repeat(40)}`);
    console.log(`✅ Claude Data-Driven Generate Complete`);
    console.log(`   Generated: ${completed} | Posted: ${postSuccess} | Failed: ${failed}`);
    console.log('='.repeat(40) + '\n');
  });

program
  .command('claude-process')
  .description('Process a Claude batch: run un-processed prompts and/or post results to Ghost')
  .argument('<batchDir>', 'Path to batch directory (e.g. data/claude-batches/batch-12345)')
  .option('-a, --autopost', 'Publish immediately instead of draft')
  .option('--parallel <number>', 'Number of parallel Claude processes', '3')
  .option('--model <model>', 'Claude model to use', 'sonnet')
  .option('--post-only', 'Only post existing results to Ghost (skip running prompts)')
  .option('--view', 'Stream Claude subprocess output to terminal (see it thinking)')
  .action(async (batchDir, options) => {
    const autoPost = !!options.autopost;
    const parallel = parseInt(options.parallel);
    const model = options.model;
    const postOnly = !!options.postOnly;
    const view = !!options.view;

    console.log('\n🤖 CLAUDE BATCH PROCESS');
    console.log('='.repeat(40));
    console.log(`Batch: ${batchDir}\n`);

    // Check batch exists
    const fs = await import('fs');
    if (!fs.existsSync(batchDir)) {
      console.error(`❌ Batch directory not found: ${batchDir}\n`);
      return;
    }

    // Show current status
    claudeGetBatchStatus(batchDir);

    // Run un-processed prompts (unless --post-only)
    if (!postOnly) {
      console.log('\n🚀 Running un-processed prompts...');
      await claudeRunBatch(batchDir, { parallel, model, view });
    }

    // Load and post results
    const articles = claudeLoadBatchResults(batchDir);

    if (articles.length === 0) {
      console.log('\n❌ No results to post.\n');
      return;
    }

    console.log(`\n📋 Posting ${articles.length} articles to Ghost...\n`);

    const connected = await testConnection();
    if (!connected) {
      console.error('❌ Could not connect to Ghost.\n');
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const article of articles) {
      try {
        const post = await createPost(article, autoPost);
        const status = autoPost ? '🌐 Published' : '📋 Draft saved';
        console.log(`  ${status}: ${post.title}`);

        await saveGeneratedTopic({
          ...article._topicInfo,
          title: article.title,
          ghostPostId: post.id
        });

        successCount++;
      } catch (error) {
        console.error(`  ❌ Failed to post "${article.title}": ${error.message}`);
        failCount++;
      }
    }

    console.log(`\n${'='.repeat(40)}`);
    console.log(`✅ Claude Process Complete`);
    console.log(`   Posted: ${successCount} | Failed: ${failCount}`);
    console.log('='.repeat(40) + '\n');
  });

program
  .command('claude-batch-status')
  .description('Show status of Claude CLI batches')
  .argument('[batchDir]', 'Specific batch directory to check (omit to list all)')
  .action(async (batchDir) => {
    claudeGetBatchStatus(batchDir || null);
    console.log('');
  });

program
  .command('claude-fast')
  .description('FAST: Skip research, use Search Console data directly, generate via Claude CLI')
  .option('-c, --count <number>', 'Number of articles', '5')
  .option('-d, --dryrun', 'Prepare prompts only')
  .option('-a, --autopost', 'Publish immediately')
  .option('--parallel <number>', 'Parallel Claude processes', '5')
  .option('--model <model>', 'Claude model', 'sonnet')
  .option('--view', 'Stream Claude output to terminal')
  .action(async (options) => {
    const count = parseInt(options.count);
    const dryRun = !!options.dryrun;
    const autoPost = !!options.autopost;
    const parallel = parseInt(options.parallel);
    const model = options.model;
    const view = !!options.view;

    console.log('\n⚡ CLAUDE FAST GENERATE');
    console.log('='.repeat(40));
    console.log(`${count} articles | ${model} | ${parallel} parallel${view ? ' | VIEW' : ''}`);
    if (dryRun) console.log('DRY RUN');
    console.log('');

    // Step 1: Fast topics from Search Console (no Puppeteer, no RSS, no AI analysis)
    const topics = await generateFastTopics(count);

    if (topics.length === 0) {
      console.log('\n❌ No topics generated.\n');
      return;
    }

    // Step 2: Write prompts
    const batchDir = claudePrepareBatch(topics);

    if (dryRun) {
      console.log(`\n🔸 DRY RUN done. Prompts: ${batchDir}`);
      console.log(`  Run: node index.js claude-process ${batchDir}\n`);
      return;
    }

    // Step 3: Run Claude
    const { completed, failed } = await claudeRunBatch(batchDir, { parallel, model, view });

    if (completed === 0) {
      console.log('\n❌ No articles generated.\n');
      return;
    }

    // Step 4: Post to Ghost
    const connected = await testConnection();
    if (!connected) {
      console.log(`❌ Ghost offline. Results saved: ${batchDir}`);
      console.log(`  Post later: node index.js claude-process ${batchDir} --post-only -a\n`);
      return;
    }

    const articles = claudeLoadBatchResults(batchDir);
    let posted = 0;

    for (const article of articles) {
      try {
        const post = await createPost(article, autoPost);
        console.log(`  ${autoPost ? '🌐' : '📋'} ${post.title}`);
        await saveGeneratedTopic({ ...article._topicInfo, title: article.title, ghostPostId: post.id });
        posted++;
      } catch (error) {
        console.error(`  ❌ ${article.title}: ${error.message}`);
      }
    }

    console.log(`\n${'='.repeat(40)}`);
    console.log(`⚡ Fast Generate: ${completed} written, ${posted} posted, ${failed} failed`);
    console.log('='.repeat(40) + '\n');
  });

program
  .command('claude-turbo')
  .description('TURBO: Maximum throughput pipeline — generate + post simultaneously with 15 parallel workers')
  .option('-c, --count <number>', 'Number of articles', '10')
  .option('-d, --dryrun', 'Prepare prompts only')
  .option('-a, --autopost', 'Publish immediately')
  .option('--parallel <number>', 'Concurrent Claude workers', '15')
  .option('--model <model>', 'Claude model', 'sonnet')
  .option('--view', 'Stream Claude output to terminal')
  .action(async (options) => {
    const count = parseInt(options.count);
    const dryRun = !!options.dryrun;
    const autoPost = !!options.autopost;
    const parallel = parseInt(options.parallel);
    const model = options.model;
    const view = !!options.view;

    console.log('\n⚡ CLAUDE TURBO MODE');
    console.log('='.repeat(50));
    console.log(`${count} articles | ${model} | ${parallel} parallel workers`);
    console.log(`Pipeline: generate → post immediately (no waiting)`);
    if (dryRun) console.log('DRY RUN - prompts only');
    if (!autoPost && !dryRun) console.log('Mode: drafts (use -a to publish)');
    if (autoPost) console.log('Mode: auto-publish');
    console.log('='.repeat(50) + '\n');

    // Step 1: Fast topics from Search Console
    const topics = await generateFastTopics(count);

    if (topics.length === 0) {
      console.log('\n❌ No topics generated.\n');
      return;
    }

    // Step 2: Write prompts
    const batchDir = claudePrepareBatch(topics);

    if (dryRun) {
      console.log(`\n🔸 DRY RUN done. Prompts: ${batchDir}`);
      console.log(`  Run: node index.js claude-process ${batchDir}\n`);
      return;
    }

    // Step 3: Test Ghost connection before starting pipeline
    const connected = await testConnection();
    if (!connected) {
      console.log('❌ Ghost offline. Falling back to generate-only mode.');
      console.log('   Articles will be saved to disk. Post later with claude-process.\n');
    }

    // Step 4: Run turbo pipeline — generate + post in one flow
    const postFn = connected ? async (article, topicInfo) => {
      const post = await createPost(article, autoPost);
      console.log(`  ${autoPost ? '🌐 Published' : '📋 Draft'}: ${post.title}`);
      await saveGeneratedTopic({
        ...topicInfo,
        title: article.title,
        ghostPostId: post.id
      });
    } : null;

    const result = await claudeRunTurbo(batchDir, { parallel, model, view, postFn });

    // If Ghost was offline, remind about saved results
    if (!connected && result.generated > 0) {
      console.log(`\n📁 Results saved to: ${batchDir}`);
      console.log(`  Post later: node index.js claude-process ${batchDir} --post-only -a\n`);
    }
  });

program
  .command('fetch-gsc')
  .description('Fetch data from Google Search Console API')
  .option('--days <number>', 'Number of days to fetch (default: 28)', '28')
  .option('--start <date>', 'Start date (YYYY-MM-DD)')
  .option('--end <date>', 'End date (YYYY-MM-DD)')
  .action(async (options) => {
    console.log('\n📊 Fetching Google Search Console data...\n');
    try {
      const fetchOptions = {};
      if (options.start && options.end) {
        fetchOptions.startDate = options.start;
        fetchOptions.endDate = options.end;
      } else {
        const days = parseInt(options.days);
        const end = new Date();
        end.setDate(end.getDate() - 3);
        const start = new Date(end);
        start.setDate(start.getDate() - days);
        fetchOptions.startDate = start.toISOString().split('T')[0];
        fetchOptions.endDate = end.toISOString().split('T')[0];
      }
      await fetchGscData(fetchOptions);
      console.log('\n✅ Search Console data fetched successfully!');
    } catch (error) {
      console.error(`\n❌ Failed to fetch GSC data: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('article-health')
  .description('Analyze health of published articles using Search Console data')
  .action(async () => {
    console.log('\n🏥 Analyzing article health...\n');

    try {
      const articles = await getArticleHealth();
      printHealthReport(articles);
    } catch (error) {
      console.error(`\n❌ Failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('unpublish-dead')
  .description('Unpublish dead articles (set to draft)')
  .option('--dry-run', 'Preview what would be unpublished without making changes')
  .option('--min-age <days>', 'Minimum age in days before considering an article dead', '60')
  .action(async (options) => {
    console.log('\n🗑️  Finding dead articles to unpublish...\n');

    try {
      await unpublishDeadArticles({
        dryRun: !!options.dryRun,
        minAge: parseInt(options.minAge),
      });
    } catch (error) {
      console.error(`\n❌ Failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('rewrite-dead')
  .description('Rewrite dead articles with fresh AI content')
  .option('-a, --autopost', 'Publish rewritten articles immediately')
  .option('-l, --limit <number>', 'Maximum articles to rewrite', '5')
  .option('--min-age <days>', 'Minimum age in days', '60')
  .action(async (options) => {
    console.log('\n✍️  Rewriting dead articles...\n');

    try {
      await rewriteDeadArticles({
        autoPost: !!options.autopost,
        limit: parseInt(options.limit),
        minAge: parseInt(options.minAge),
      });
    } catch (error) {
      console.error(`\n❌ Failed: ${error.message}`);
      process.exit(1);
    }
  });

program.parse();
