import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { config } from "./config.js";
import { buildPrompt } from "./prompts.js";

const openai = new OpenAI({ apiKey: config.openaiApiKey });

const BATCH_DIR = "./data/batches";

// Ensure batch directory exists
function ensureBatchDir() {
  if (!fs.existsSync(BATCH_DIR)) {
    fs.mkdirSync(BATCH_DIR, { recursive: true });
  }
}

// Create JSONL file for batch processing
export async function createBatchFile(topics) {
  ensureBatchDir();

  const timestamp = Date.now();
  const filename = `batch-${timestamp}.jsonl`;
  const filepath = path.join(BATCH_DIR, filename);

  const requests = topics.map((topic, index) => {
    const prompt = buildPrompt(topic.category || "seo-gap", topic);

    return {
      custom_id: `article-${index}-${timestamp}`,
      method: "POST",
      url: "/v1/chat/completions",
      body: {
        model: config.openaiModel,
        messages: [
          {
            role: "system",
            content:
              "Du er en profesjonell SEO-skribent. Returner alltid svar i det spesifiserte JSON-formatet.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_completion_tokens: 4000,
        temperature: 0.7,
      },
    };
  });

  // Write JSONL file
  const jsonl = requests.map((r) => JSON.stringify(r)).join("\n");
  fs.writeFileSync(filepath, jsonl);

  console.log(`📝 Created batch file: ${filepath}`);
  console.log(`   Contains ${requests.length} article requests`);

  // Save topic mapping for later
  const mappingFile = path.join(BATCH_DIR, `batch-${timestamp}-mapping.json`);
  fs.writeFileSync(
    mappingFile,
    JSON.stringify(
      {
        timestamp,
        topics: topics.map((t, i) => ({
          custom_id: `article-${i}-${timestamp}`,
          topic: t,
        })),
      },
      null,
      2
    )
  );

  return { filepath, mappingFile, timestamp, count: requests.length };
}

// Upload batch file to OpenAI
export async function uploadBatchFile(filepath) {
  console.log("📤 Uploading batch file to OpenAI...");

  const file = await openai.files.create({
    file: fs.createReadStream(filepath),
    purpose: "batch",
  });

  console.log(`✅ File uploaded: ${file.id}`);
  return file;
}

// Create batch job
export async function createBatch(fileId, metadata = {}) {
  console.log("🚀 Creating batch job...");

  const batch = await openai.batches.create({
    input_file_id: fileId,
    endpoint: "/v1/chat/completions",
    completion_window: "24h",
    metadata: {
      description: "Blog article generation for minekvitteringer.no",
      ...metadata,
    },
  });

  console.log(`✅ Batch created: ${batch.id}`);
  console.log(`   Status: ${batch.status}`);

  // Save batch info
  ensureBatchDir();
  const batchInfoFile = path.join(BATCH_DIR, `batch-info-${batch.id}.json`);
  fs.writeFileSync(
    batchInfoFile,
    JSON.stringify(
      {
        batchId: batch.id,
        fileId: fileId,
        createdAt: new Date().toISOString(),
        status: batch.status,
        metadata,
      },
      null,
      2
    )
  );

  return batch;
}

// Check batch status
export async function checkBatchStatus(batchId) {
  const batch = await openai.batches.retrieve(batchId);

  console.log(`\n📊 Batch Status: ${batch.id}`);
  console.log(`   Status: ${batch.status}`);
  console.log(
    `   Created: ${new Date(batch.created_at * 1000).toLocaleString()}`
  );

  if (batch.request_counts) {
    console.log(
      `   Completed: ${batch.request_counts.completed}/${batch.request_counts.total}`
    );
    console.log(`   Failed: ${batch.request_counts.failed}`);
  }

  if (batch.status === "completed") {
    console.log(`   Output file: ${batch.output_file_id}`);
  }

  if (batch.status === "failed") {
    console.log(`   ❌ Batch failed`);
    if (batch.errors) {
      console.log(`   Errors:`, batch.errors);
    }
  }

  return batch;
}

// Download and parse batch results
export async function downloadBatchResults(batchId) {
  const batch = await openai.batches.retrieve(batchId);

  if (batch.status !== "completed") {
    throw new Error(`Batch not completed. Status: ${batch.status}`);
  }

  if (!batch.output_file_id) {
    throw new Error("No output file available");
  }

  console.log("📥 Downloading batch results...");

  const fileResponse = await openai.files.content(batch.output_file_id);
  const content = await fileResponse.text();

  // Parse JSONL results
  const results = content
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));

  console.log(`✅ Downloaded ${results.length} results`);

  // Save results locally
  ensureBatchDir();
  const resultsFile = path.join(BATCH_DIR, `batch-results-${batchId}.json`);
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));

  return results;
}

// Parse article from batch result
export function parseArticleFromResult(result) {
  if (result.error) {
    console.error(`❌ Request ${result.custom_id} failed:`, result.error);
    return null;
  }

  const content = result.response?.body?.choices?.[0]?.message?.content;
  if (!content) {
    console.error(`❌ No content in response for ${result.custom_id}`);
    return null;
  }

  // Extract JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error(`❌ Could not parse JSON from ${result.custom_id}`);
    return null;
  }

  try {
    const article = JSON.parse(jsonMatch[0]);

    if (!article.title || !article.html) {
      console.error(
        `❌ Article missing required fields for ${result.custom_id}`
      );
      return null;
    }

    // Clean up HTML (remove H1 tags)
    article.html = article.html
      .replace(/<h1[^>]*>.*?<\/h1>/gi, "")
      .replace(/```html?\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    return {
      ...article,
      custom_id: result.custom_id,
    };
  } catch (error) {
    console.error(
      `❌ JSON parse error for ${result.custom_id}:`,
      error.message
    );
    return null;
  }
}

// List all batches
export async function listBatches(limit = 10) {
  const batches = await openai.batches.list({ limit });

  console.log("\n📋 Recent Batches:\n");

  for (const batch of batches.data) {
    const created = new Date(batch.created_at * 1000).toLocaleString();
    const counts = batch.request_counts || {};

    console.log(`  ${batch.id}`);
    console.log(`    Status: ${batch.status}`);
    console.log(`    Created: ${created}`);
    if (counts.total) {
      console.log(
        `    Progress: ${counts.completed || 0}/${counts.total} (${
          counts.failed || 0
        } failed)`
      );
    }
    console.log("");
  }

  return batches.data;
}

// Cancel a batch
export async function cancelBatch(batchId) {
  console.log(`🛑 Cancelling batch ${batchId}...`);
  const batch = await openai.batches.cancel(batchId);
  console.log(`   Status: ${batch.status}`);
  return batch;
}

// Full batch workflow: create, upload, start
export async function startBatchGeneration(topics, autoPost = false) {
  console.log("\n🚀 BATCH GENERATION MODE (50% discount!)");
  console.log("=".repeat(50));
  console.log(`Creating batch for ${topics.length} articles\n`);

  // Step 1: Create JSONL file
  const { filepath, mappingFile, timestamp, count } = await createBatchFile(
    topics
  );

  // Step 2: Upload to OpenAI
  const file = await uploadBatchFile(filepath);

  // Step 3: Create batch
  const batch = await createBatch(file.id, {
    timestamp: timestamp.toString(),
    articleCount: count.toString(),
    autoPost: autoPost.toString(),
    mappingFile,
  });

  console.log("\n" + "=".repeat(50));
  console.log("📋 BATCH SUBMITTED");
  console.log("=".repeat(50));
  console.log(`\nBatch ID: ${batch.id}`);
  console.log(`Articles: ${count}`);
  console.log(`Status: ${batch.status}`);
  console.log(`\nResults will be ready within 24 hours (usually much faster).`);
  console.log(`\nTo check status:`);
  console.log(`  node index.js batch-status ${batch.id}`);
  console.log(`\nTo process results when ready:`);
  console.log(`  node index.js batch-process ${batch.id}`);
  console.log("");

  return batch;
}

// Load topic mapping from batch
export function loadTopicMapping(batchId) {
  // Find mapping file
  const files = fs.readdirSync(BATCH_DIR);
  const infoFile = files.find((f) => f === `batch-info-${batchId}.json`);

  if (infoFile) {
    const info = JSON.parse(fs.readFileSync(path.join(BATCH_DIR, infoFile)));
    if (
      info.metadata?.mappingFile &&
      fs.existsSync(info.metadata.mappingFile)
    ) {
      return JSON.parse(fs.readFileSync(info.metadata.mappingFile));
    }
  }

  // Try to find by timestamp in batch info
  return null;
}
