import jwt from 'jsonwebtoken';
import { config } from './config.js';

// Ghost Admin API uses JWT for authentication
function generateGhostToken() {
  const [id, secret] = config.ghostAdminKey.split(':');

  const token = jwt.sign({}, Buffer.from(secret, 'hex'), {
    keyid: id,
    algorithm: 'HS256',
    expiresIn: '5m',
    audience: '/admin/'
  });

  return token;
}

// Create a post in Ghost (draft or published)
export async function createPost(article, autoPublish = false) {
  const token = generateGhostToken();
  const url = `${config.ghostApiUrl}posts/?source=html`;

  // Prepare the post data
  const postData = {
    posts: [{
      title: article.title,
      html: article.html,
      status: autoPublish ? 'published' : 'draft',
      tags: [{ name: config.defaultTag }],
      meta_title: article.metaTitle || article.title,
      meta_description: article.metaDescription,
      custom_excerpt: article.excerpt
    }]
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Ghost ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(postData)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Ghost API error: ${JSON.stringify(error)}`);
    }

    const result = await response.json();
    const post = result.posts[0];

    console.log(`${autoPublish ? 'Published' : 'Draft created'}: ${post.title}`);
    console.log(`Edit URL: ${config.ghostApiUrl.replace('/ghost/api/admin/', '/ghost/#/editor/post/')}${post.id}`);

    return post;
  } catch (error) {
    console.error('Failed to create Ghost post:', error.message);
    throw error;
  }
}

// Get all posts with full content for analysis
export async function getAllPostsWithContent() {
  const token = generateGhostToken();
  let allPosts = [];
  let page = 1;

  try {
    while (true) {
      const url = `${config.ghostApiUrl}posts/?limit=100&page=${page}&fields=id,title,slug,url,html,plaintext,published_at,meta_title,meta_description,custom_excerpt&filter=status:published`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Ghost ${token}` }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Ghost API error: ${JSON.stringify(error)}`);
      }

      const result = await response.json();
      allPosts = allPosts.concat(result.posts);

      if (!result.meta?.pagination?.next) break;
      page++;
    }

    console.log(`  Fetched ${allPosts.length} published posts from Ghost`);
    return allPosts;
  } catch (error) {
    console.error('Failed to fetch posts with content:', error.message);
    return [];
  }
}

// Update an existing post (for rewriting content)
export async function updatePost(postId, data) {
  const token = generateGhostToken();

  // First, get the current post to get its updated_at (required by Ghost API)
  const getUrl = `${config.ghostApiUrl}posts/${postId}/`;
  const getResponse = await fetch(getUrl, {
    headers: { 'Authorization': `Ghost ${token}` }
  });

  if (!getResponse.ok) {
    const error = await getResponse.json();
    throw new Error(`Ghost API error (get post): ${JSON.stringify(error)}`);
  }

  const current = await getResponse.json();
  const updatedAt = current.posts[0].updated_at;

  // Now update the post
  const updateUrl = `${config.ghostApiUrl}posts/${postId}/?source=html`;
  const postData = {
    posts: [{
      ...data,
      updated_at: updatedAt
    }]
  };

  const response = await fetch(updateUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Ghost ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(postData)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Ghost API error (update): ${JSON.stringify(error)}`);
  }

  const result = await response.json();
  return result.posts[0];
}

// Change a post to draft status (unpublish)
export async function draftPost(postId) {
  return updatePost(postId, { status: 'draft' });
}

// Get existing posts to check for duplicates
export async function getExistingPosts() {
  const token = generateGhostToken();
  const url = `${config.ghostApiUrl}posts/?limit=all&fields=title,slug`;

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Ghost ${token}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Ghost API error: ${JSON.stringify(error)}`);
    }

    const result = await response.json();
    return result.posts.map(p => ({ title: p.title, slug: p.slug }));
  } catch (error) {
    console.error('Failed to fetch existing posts:', error.message);
    return [];
  }
}

// Test Ghost connection
export async function testConnection() {
  const token = generateGhostToken();
  const url = `${config.ghostApiUrl}site/`;

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Ghost ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('Connection failed');
    }

    const result = await response.json();
    console.log(`Connected to Ghost: ${result.site.title}`);
    return true;
  } catch (error) {
    console.error('Ghost connection failed:', error.message);
    return false;
  }
}
