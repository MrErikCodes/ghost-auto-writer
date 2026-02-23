import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { buildPrompt } from './prompts.js';
import { loadSearchConsoleData } from './seo-gaps.js';

const CLAUDE_BATCH_DIR = './data/claude-batches';

function ensureBatchDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * FAST topic generation from Search Console data + cached trends.
 * No Puppeteer, no RSS, no AI analysis - just raw data -> topics.
 */
export async function generateFastTopics(count = 10) {
  console.log('⚡ Fast topic generation from Search Console data...\n');

  const scData = await loadSearchConsoleData();
  if (!scData?.queries?.length) {
    console.log('❌ No Search Console data found.');
    return [];
  }

  // Load cached trends if available
  let cachedTrends = [];
  try {
    const brainFile = './data/agent-brain.json';
    if (fs.existsSync(brainFile)) {
      const brain = JSON.parse(fs.readFileSync(brainFile, 'utf-8'));
      cachedTrends = brain.cachedTrends?.data || [];
    }
  } catch (e) { /* ignore */ }

  // Strategy 1: SEO gaps - high impressions, low CTR (best opportunities)
  const gaps = scData.queries
    .filter(q => q.impressions > 20 && q.ctr < 3)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, count * 2);

  // Strategy 2: Rising keywords - some clicks, room to grow
  const rising = scData.queries
    .filter(q => q.clicks > 0 && q.position > 3 && q.position < 20)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, count);

  // Strategy 3: Trending topics from cache
  const trendTopics = cachedTrends.slice(0, 10).map(t => ({
    category: 'trending',
    topic: `${t.title || t.topic}: Slik påvirker det kvitteringer og dokumentasjon`,
    query: (t.title || t.topic || '').toLowerCase(),
    keywords: t.relatedQueries || [],
    dataSource: 'google-trends',
    rationale: `Trending i Norge: ${t.title || t.topic}`
  }));

  // Build topics from gaps
  const gapTopics = gaps.map(g => ({
    category: 'seo-gap',
    topic: capitalizeFirst(g.query),
    query: g.query,
    keywords: [],
    dataSource: 'search-console',
    rationale: `${g.impressions} visninger, ${g.clicks} klikk, posisjon ${Math.round(g.position)}, CTR ${(g.ctr).toFixed(1)}%`
  }));

  // Build topics from rising
  const risingTopics = rising.map(g => ({
    category: 'seo-gap',
    topic: capitalizeFirst(g.query),
    query: g.query,
    keywords: [],
    dataSource: 'search-console-rising',
    rationale: `Rising: ${g.clicks} klikk, posisjon ${Math.round(g.position)} (room to grow)`
  }));

  // Mix: 50% gaps, 30% rising, 20% trends
  const gapCount = Math.ceil(count * 0.5);
  const risingCount = Math.ceil(count * 0.3);
  const trendCount = count - gapCount - risingCount;

  const topics = [
    ...gapTopics.slice(0, gapCount),
    ...risingTopics.slice(0, risingCount),
    ...trendTopics.slice(0, Math.max(trendCount, 0))
  ].slice(0, count);

  console.log(`📊 Generated ${topics.length} topics:`);
  console.log(`   ${Math.min(gapCount, gapTopics.length)} from SEO gaps`);
  console.log(`   ${Math.min(risingCount, risingTopics.length)} from rising keywords`);
  console.log(`   ${Math.min(Math.max(trendCount, 0), trendTopics.length)} from trends\n`);

  topics.forEach((t, i) => {
    console.log(`  ${i + 1}. [${t.category}] ${t.topic}`);
    console.log(`     ${t.rationale}`);
  });

  return topics;
}

function capitalizeFirst(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Prepare a batch directory with prompt files and mapping.
 */
export function prepareBatch(topics) {
  const timestamp = Date.now();
  const batchDir = path.join(CLAUDE_BATCH_DIR, `batch-${timestamp}`);
  ensureBatchDir(batchDir);

  topics.forEach((topic, index) => {
    const prompt = buildPrompt(topic.category || 'seo-gap', topic);
    const promptFile = path.join(batchDir, `prompt-${index}.txt`);
    fs.writeFileSync(promptFile, prompt);
  });

  const mapping = {
    timestamp,
    createdAt: new Date().toISOString(),
    topics: topics.map((topic, index) => ({
      index,
      promptFile: `prompt-${index}.txt`,
      topic
    }))
  };
  fs.writeFileSync(path.join(batchDir, 'mapping.json'), JSON.stringify(mapping, null, 2));

  console.log(`\n📁 Batch: ${batchDir}`);
  console.log(`📝 ${topics.length} prompts ready`);

  return batchDir;
}

/**
 * Run a single claude -p process.
 */
export function runSingle(promptFile, resultFile, model = 'sonnet', { view = false } = {}) {
  return new Promise((resolve, reject) => {
    const promptContent = fs.readFileSync(promptFile, 'utf-8');
    const rawFile = resultFile.replace('.json', '-raw.txt');
    const num = path.basename(promptFile).match(/\d+/)?.[0] || '?';

    const env = { ...process.env };
    delete env.CLAUDE_CODE;
    delete env.CLAUDECODE;

    const args = ['-p', '--output-format', 'text', '--model', model];

    const proc = spawn('claude', args, {
      env,
      stdio: ['pipe', 'pipe', view ? 'inherit' : 'pipe'],
      shell: true,
      timeout: 180000
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      if (view) {
        process.stdout.write(`[${num}] ${chunk}`);
      }
    });

    if (!view) {
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });
    }

    proc.stdin.write(promptContent);
    proc.stdin.end();

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`Timeout after 180s for prompt-${num}`));
    }, 180000);

    proc.on('close', (code) => {
      clearTimeout(timer);
      fs.writeFileSync(rawFile, stdout);

      if (code !== 0) {
        reject(new Error(`claude exited with code ${code}: ${stderr.substring(0, 300)}`));
        return;
      }

      try {
        const article = parseClaudeOutput(stdout);
        fs.writeFileSync(resultFile, JSON.stringify(article, null, 2));
        resolve(article);
      } catch (err) {
        reject(new Error(`Parse failed for prompt-${num}: ${err.message}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Spawn failed: ${err.message}`));
    });
  });
}

/**
 * Parse article JSON from claude output.
 */
function parseClaudeOutput(text) {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in output');
  }

  const article = JSON.parse(jsonMatch[0]);

  if (!article.title || !article.html) {
    throw new Error('Missing title or html');
  }

  article.html = article.html
    .replace(/<h1[^>]*>.*?<\/h1>/gi, '')
    .replace(/```html?\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  return article;
}

/**
 * Run batch with concurrency. Saves results as they complete.
 */
export async function runBatch(batchDir, options = {}) {
  const { parallel = 3, model = 'sonnet', view = false } = options;

  const files = fs.readdirSync(batchDir);
  const promptFiles = files
    .filter(f => f.match(/^prompt-\d+\.txt$/))
    .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));

  const alreadyDone = new Set();
  for (const f of files) {
    const match = f.match(/^result-(\d+)\.json$/);
    if (match) alreadyDone.add(parseInt(match[1]));
  }

  const toProcess = promptFiles.filter(f => !alreadyDone.has(parseInt(f.match(/\d+/)[0])));

  if (alreadyDone.size > 0) {
    console.log(`⏩ ${alreadyDone.size} already done, ${toProcess.length} remaining`);
  }

  console.log(`\n🚀 Running ${toProcess.length} articles | model: ${model} | parallel: ${parallel}\n`);

  let completed = 0;
  let failed = 0;
  const total = toProcess.length;
  const startTime = Date.now();
  const queue = [...toProcess];

  async function worker() {
    while (queue.length > 0) {
      const promptFile = queue.shift();
      const num = promptFile.match(/\d+/)[0];
      const fullPromptPath = path.join(batchDir, promptFile);
      const resultPath = path.join(batchDir, `result-${num}.json`);

      const articleStart = Date.now();
      try {
        const article = await runSingle(fullPromptPath, resultPath, model, { view });
        completed++;
        const elapsed = ((Date.now() - articleStart) / 1000).toFixed(0);
        console.log(`  ✅ [${completed + failed}/${total}] (${elapsed}s) #${num}: ${article.title.substring(0, 60)}`);
      } catch (err) {
        failed++;
        console.error(`  ❌ [${completed + failed}/${total}] #${num}: ${err.message}`);
      }
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(parallel, toProcess.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\n${'='.repeat(40)}`);
  console.log(`✅ Done in ${totalTime}s: ${completed} ok, ${failed} failed`);
  console.log('='.repeat(40));

  return { completed, failed, total };
}

/**
 * Turbo mode: pipeline architecture where each worker generates + posts immediately.
 * No waiting for all articles — each one goes live as soon as it's ready.
 */
export async function runTurbo(batchDir, options = {}) {
  const { parallel = 15, model = 'sonnet', view = false, postFn = null } = options;

  const files = fs.readdirSync(batchDir);
  const promptFiles = files
    .filter(f => f.match(/^prompt-\d+\.txt$/))
    .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));

  const alreadyDone = new Set();
  for (const f of files) {
    const match = f.match(/^result-(\d+)\.json$/);
    if (match) alreadyDone.add(parseInt(match[1]));
  }

  const toProcess = promptFiles.filter(f => !alreadyDone.has(parseInt(f.match(/\d+/)[0])));

  if (alreadyDone.size > 0) {
    console.log(`⏩ ${alreadyDone.size} already done, ${toProcess.length} remaining`);
  }

  console.log(`\n🚀 TURBO: ${toProcess.length} articles | model: ${model} | parallel: ${parallel}\n`);

  const mapping = loadBatchMapping(batchDir);
  let generated = 0;
  let posted = 0;
  let failed = 0;
  const total = toProcess.length;
  const startTime = Date.now();
  const queue = [...toProcess];

  function printProgress() {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const rate = generated > 0 ? (elapsed / generated).toFixed(0) : '?';
    process.stdout.write(`\r  ⚡ [gen: ${generated}/${total}] [posted: ${posted}/${generated}] [failed: ${failed}] [${elapsed}s, ~${rate}s/article]  `);
  }

  async function worker() {
    while (queue.length > 0) {
      const promptFile = queue.shift();
      if (!promptFile) break;

      const num = promptFile.match(/\d+/)[0];
      const fullPromptPath = path.join(batchDir, promptFile);
      const resultPath = path.join(batchDir, `result-${num}.json`);

      try {
        const article = await runSingle(fullPromptPath, resultPath, model, { view });
        generated++;
        if (!view) printProgress();
        console.log(`\n  ✅ #${num}: ${article.title.substring(0, 70)}`);

        // Immediate posting via callback
        if (postFn) {
          try {
            const topicInfo = mapping?.topics?.find(t => t.index === parseInt(num))?.topic || {};
            await postFn(article, topicInfo);
            posted++;
            if (!view) printProgress();
          } catch (postErr) {
            console.error(`\n  ⚠ Post failed #${num}: ${postErr.message}`);
          }
        }
      } catch (err) {
        failed++;
        console.error(`\n  ❌ #${num}: ${err.message}`);
        if (!view) printProgress();
      }
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(parallel, toProcess.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\n\n${'='.repeat(50)}`);
  console.log(`⚡ TURBO DONE in ${totalTime}s`);
  console.log(`   Generated: ${generated} | Posted: ${posted} | Failed: ${failed}`);
  if (generated > 0) {
    console.log(`   Avg: ${(totalTime / generated).toFixed(1)}s/article | Throughput: ${(generated / (totalTime / 60)).toFixed(1)} articles/min`);
  }
  console.log('='.repeat(50));

  return { generated, posted, failed, total };
}

/**
 * Get batch status.
 */
export function getBatchStatus(batchDir) {
  if (batchDir) {
    return getSingleBatchStatus(batchDir);
  }

  ensureBatchDir(CLAUDE_BATCH_DIR);
  const dirs = fs.readdirSync(CLAUDE_BATCH_DIR)
    .filter(d => d.startsWith('batch-'))
    .sort()
    .reverse();

  if (dirs.length === 0) {
    console.log('\n📋 No Claude batches found.\n');
    return [];
  }

  console.log('\n📋 Claude CLI Batches:\n');
  return dirs.map(dir => getSingleBatchStatus(path.join(CLAUDE_BATCH_DIR, dir), true));
}

function getSingleBatchStatus(batchDir, compact = false) {
  const files = fs.readdirSync(batchDir);
  const prompts = files.filter(f => f.match(/^prompt-\d+\.txt$/));
  const results = files.filter(f => f.match(/^result-\d+\.json$/));

  let mappingData = null;
  if (files.includes('mapping.json')) {
    mappingData = JSON.parse(fs.readFileSync(path.join(batchDir, 'mapping.json'), 'utf-8'));
  }

  const status = {
    dir: batchDir,
    name: path.basename(batchDir),
    createdAt: mappingData?.createdAt || 'unknown',
    totalPrompts: prompts.length,
    completedResults: results.length,
    isComplete: results.length >= prompts.length,
    progress: prompts.length > 0 ? Math.round((results.length / prompts.length) * 100) : 0
  };

  if (compact) {
    const icon = status.isComplete ? '✅' : '⏳';
    console.log(`  ${icon} ${status.name}  ${status.completedResults}/${status.totalPrompts}  (${status.progress}%)  ${status.createdAt}`);
  } else {
    console.log(`\n📊 ${status.name} — ${status.completedResults}/${status.totalPrompts} (${status.progress}%) — ${status.isComplete ? 'Complete' : 'In progress'}`);
  }

  return status;
}

/**
 * Load all result JSONs from a batch directory.
 */
export function loadBatchResults(batchDir) {
  const files = fs.readdirSync(batchDir);
  const resultFiles = files
    .filter(f => f.match(/^result-\d+\.json$/))
    .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));

  const mapping = loadBatchMapping(batchDir);
  const articles = [];

  for (const file of resultFiles) {
    try {
      const article = JSON.parse(fs.readFileSync(path.join(batchDir, file), 'utf-8'));
      const num = parseInt(file.match(/\d+/)[0]);
      articles.push({
        ...article,
        _index: num,
        _topicInfo: mapping?.topics?.find(t => t.index === num)?.topic || {}
      });
    } catch (err) {
      console.error(`  ⚠ ${file}: ${err.message}`);
    }
  }

  return articles;
}

export function loadBatchMapping(batchDir) {
  const mappingPath = path.join(batchDir, 'mapping.json');
  if (fs.existsSync(mappingPath)) {
    return JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
  }
  return null;
}
