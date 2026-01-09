import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { config } from './config.js';
import { buildPrompt } from './prompts.js';

// Generate an article using AI SDK and OpenAI
export async function generateArticle(category, topicInfo) {
  const prompt = buildPrompt(category, topicInfo);

  console.log(`\nGenerating article for category: ${category}`);
  console.log(`Topic: ${topicInfo.topic || topicInfo.query || 'N/A'}`);

  try {
    const { text } = await generateText({
      model: openai(config.openaiModel),
      prompt: prompt,
      maxTokens: 4000,
    });

    // Parse the JSON response
    const article = parseArticleResponse(text);

    if (!article) {
      throw new Error('Could not parse article from AI response');
    }

    console.log(`Article generated: ${article.title}`);

    return {
      ...article,
      category,
      topicInfo,
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('Article generation failed:', error.message);
    throw error;
  }
}

// Parse the AI response to extract the article JSON
function parseArticleResponse(text) {
  // Try to find JSON in the response
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  if (jsonMatch) {
    try {
      const article = JSON.parse(jsonMatch[0]);

      // Validate required fields
      if (!article.title || !article.html) {
        console.error('Article missing required fields');
        return null;
      }

      // Clean up the HTML
      article.html = cleanHtml(article.html);

      return article;
    } catch (error) {
      console.error('JSON parse error:', error.message);
    }
  }

  // If no JSON found, try to construct from plain text
  console.log('No JSON found, attempting to construct article from text');
  return constructFromPlainText(text);
}

// Clean up the HTML content
function cleanHtml(html) {
  // Remove any markdown code fences
  html = html.replace(/```html?\n?/g, '').replace(/```\n?/g, '');

  // IMPORTANT: Remove any H1 tags - Ghost adds the title as H1 automatically
  html = html.replace(/<h1[^>]*>.*?<\/h1>/gi, '');

  // Ensure proper paragraph wrapping
  if (!html.startsWith('<')) {
    html = '<p>' + html.replace(/\n\n/g, '</p><p>') + '</p>';
  }

  // Fix common issues
  html = html
    .replace(/\n/g, ' ')
    .replace(/  +/g, ' ')
    .replace(/<p>\s*<\/p>/g, '')
    .replace(/<p>\s*<h/g, '<h')
    .replace(/<\/h(\d)>\s*<\/p>/g, '</h$1>')
    .trim();

  // Remove leading whitespace after H1 removal
  html = html.replace(/^\s+/, '');

  return html;
}

// Attempt to construct article from plain text response
function constructFromPlainText(text) {
  // Try to extract a title from the first line
  const lines = text.split('\n').filter(l => l.trim());

  if (lines.length < 2) {
    return null;
  }

  let title = lines[0].replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();

  // Build HTML from the rest
  let html = '';
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('## ')) {
      html += `<h2>${line.replace('## ', '')}</h2>`;
    } else if (line.startsWith('### ')) {
      html += `<h3>${line.replace('### ', '')}</h3>`;
    } else if (line.startsWith('- ')) {
      html += `<li>${line.replace('- ', '')}</li>`;
    } else if (line) {
      html += `<p>${line}</p>`;
    }
  }

  // Wrap lists properly
  html = html.replace(/(<li>.*?<\/li>)+/g, '<ul>$&</ul>');

  return {
    title,
    metaTitle: title.substring(0, 60),
    metaDescription: lines[1]?.substring(0, 155) || title,
    excerpt: lines[1] || title,
    html
  };
}

// Generate multiple articles in batch
export async function generateArticles(topics) {
  const articles = [];

  for (const topic of topics) {
    try {
      const article = await generateArticle(topic.category, topic);
      articles.push(article);

      // Small delay between generations to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Failed to generate article for topic: ${topic.topic || topic.query}`);
      console.error(error.message);
    }
  }

  return articles;
}
