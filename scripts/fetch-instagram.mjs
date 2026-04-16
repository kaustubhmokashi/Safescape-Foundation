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
const igUserId = process.env.IG_AUTH_USER_ID;
const accessToken = process.env.IG_ACCESS_TOKEN;
const targetUsername = process.env.TARGET_IG_USERNAME;
const postsLimit = Number(process.env.IG_POSTS_LIMIT || 12);
const profileUrl = process.env.IG_PROFILE_URL || (targetUsername ? `https://www.instagram.com/${targetUsername}/` : 'https://www.instagram.com/');

if (!igUserId || !accessToken || !targetUsername) {
  throw new Error('Missing IG_AUTH_USER_ID, IG_ACCESS_TOKEN, or TARGET_IG_USERNAME environment variables.');
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
  const url = withToken(new URL(`${graphBase}/${igUserId}`));
  url.searchParams.set('fields',
    `business_discovery.username(${targetUsername}){username,name,profile_picture_url,media.limit(${postsLimit}){id,caption,media_type,media_url,thumbnail_url,permalink,timestamp}}`
  );
  const payload = await fetchJson(url);
  const discoveredMedia = payload?.business_discovery?.media?.data;
  const posts = Array.isArray(discoveredMedia)
    ? discoveredMedia.map(normalizeMedia).filter((item) => item.media_url)
    : [];
  return sortByTimestampDesc(posts);
}

async function writeDataFile(fileName, payload) {
  await mkdir(dataDir, { recursive: true });
  const destination = path.join(dataDir, fileName);
  await writeFile(destination, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

async function main() {
  const posts = await fetchPosts();

  await writeDataFile('instagram-posts.json', { data: posts, syncedAt: new Date().toISOString() });

  console.log(`Synced ${posts.length} posts from @${targetUsername}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
