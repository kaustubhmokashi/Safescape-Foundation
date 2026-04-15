import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const dataDir = path.join(repoRoot, 'data');

const apiVersion = process.env.GRAPH_API_VERSION || 'v22.0';
const graphBase = `https://graph.facebook.com/${apiVersion}`;
const igUserId = process.env.IG_USER_ID;
const accessToken = process.env.IG_ACCESS_TOKEN;
const postsLimit = Number(process.env.IG_POSTS_LIMIT || 12);
const storiesLimit = Number(process.env.IG_STORIES_LIMIT || 10);
const profileUrl = process.env.IG_PROFILE_URL || 'https://www.instagram.com/safescapefoundation/';

if (!igUserId || !accessToken) {
  throw new Error('Missing IG_USER_ID or IG_ACCESS_TOKEN environment variables.');
}

function withToken(url) {
  url.searchParams.set('access_token', accessToken);
  return url;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Instagram request failed (${response.status}): ${text}`);
  }

  return response.json();
}

function sortByTimestampDesc(items) {
  return [...items].sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp));
}

function normalizeMedia(item) {
  return {
    id: item.id,
    caption: item.caption || '',
    permalink: item.permalink || profileUrl,
    media_url: item.media_url || item.thumbnail_url || '',
    media_type: item.media_type || 'IMAGE',
    timestamp: item.timestamp || new Date().toISOString()
  };
}

async function fetchPosts() {
  const url = withToken(new URL(`${graphBase}/${igUserId}/media`));
  url.searchParams.set(
    'fields',
    ['id', 'caption', 'media_type', 'media_url', 'thumbnail_url', 'permalink', 'timestamp'].join(',')
  );
  url.searchParams.set('limit', String(postsLimit));

  const payload = await fetchJson(url);
  const posts = Array.isArray(payload.data) ? payload.data.map(normalizeMedia).filter((item) => item.media_url) : [];
  return sortByTimestampDesc(posts);
}

async function fetchStories() {
  const url = withToken(new URL(`${graphBase}/${igUserId}/stories`));
  url.searchParams.set(
    'fields',
    ['id', 'caption', 'media_type', 'media_url', 'thumbnail_url', 'permalink', 'timestamp'].join(',')
  );
  url.searchParams.set('limit', String(storiesLimit));

  const payload = await fetchJson(url);
  const stories = Array.isArray(payload.data) ? payload.data.map(normalizeMedia).filter((item) => item.media_url) : [];
  return sortByTimestampDesc(stories);
}

async function writeDataFile(fileName, payload) {
  await mkdir(dataDir, { recursive: true });
  const destination = path.join(dataDir, fileName);
  await writeFile(destination, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

async function main() {
  const posts = await fetchPosts();
  let stories = [];

  try {
    stories = await fetchStories();
  } catch (error) {
    console.warn('Story sync failed, continuing with posts only.');
    console.warn(error);
  }

  await writeDataFile('instagram-posts.json', { data: posts, syncedAt: new Date().toISOString() });
  await writeDataFile('instagram-stories.json', { data: stories, syncedAt: new Date().toISOString() });

  console.log(`Synced ${posts.length} posts and ${stories.length} stories.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
