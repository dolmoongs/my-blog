// 글 목록(posts/index.json)과 글 본문(posts/<slug>.md)을 불러온다. 한 번 불러온 글은 캐시한다.

import { parseFrontMatter } from './frontmatter.js';

// 페이지 주소와 상관없이 이 파일 위치를 기준으로 posts 폴더를 찾는다.
const POSTS_DIR = new URL('../posts/', import.meta.url);
const SLUG = /^[a-z0-9-]+$/;

export class PostNotFoundError extends Error {}

export function postUrl(slug) {
  return new URL(`${slug}.md`, POSTS_DIR).href;
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const error = new Error(`${url} 요청 실패 (HTTP ${response.status})`);
    error.status = response.status;
    throw error;
  }
  return response.text();
}

let slugsPromise = null;

export function loadSlugs() {
  slugsPromise ??= fetchText(new URL('index.json', POSTS_DIR))
    .then((text) => {
      const list = JSON.parse(text);
      if (!Array.isArray(list)) throw new Error('posts/index.json은 slug 배열이어야 합니다.');
      return list.filter((slug) => typeof slug === 'string' && SLUG.test(slug));
    })
    .catch((error) => {
      slugsPromise = null; // 다음 방문 때 다시 시도할 수 있게 한다.
      throw error;
    });
  return slugsPromise;
}

const postCache = new Map();

export function loadPost(slug) {
  // 주소에서 온 slug로 경로를 만들기 때문에, 허용된 문자만 통과시킨다. (../ 같은 경로 이동 차단)
  if (!SLUG.test(slug)) return Promise.reject(new PostNotFoundError(slug));

  if (!postCache.has(slug)) {
    const promise = fetchText(postUrl(slug))
      .then((text) => toPost(slug, text))
      .catch((error) => {
        postCache.delete(slug);
        throw error.status === 404 ? new PostNotFoundError(slug) : error;
      });
    postCache.set(slug, promise);
  }
  return postCache.get(slug);
}

function toPost(slug, text) {
  const { data, body } = parseFrontMatter(text);
  const tags = Array.isArray(data.tags) ? data.tags : data.tags ? [data.tags] : [];
  return {
    slug,
    title: data.title || slug,
    date: data.date || '',
    tags,
    summary: data.summary || '',
    body,
  };
}

// 목록에 보일 글 전체를 날짜 내림차순으로 돌려준다. 불러오지 못한 글은 건너뛴다.
export async function loadAllPosts() {
  const slugs = await loadSlugs();
  const results = await Promise.allSettled(slugs.map(loadPost));

  const posts = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') posts.push(result.value);
    else console.warn(`글을 불러오지 못했습니다: ${slugs[index]}`, result.reason);
  });
  return posts.sort((a, b) => b.date.localeCompare(a.date));
}
