// 화면 그리기. DOM을 만지는 유일한 모듈이다.
// 마크다운 변환 결과만 innerHTML로 넣고, 파일에서 읽은 나머지 문자열(제목, 태그 등)은 텍스트 노드로만 넣는다.

import { markdown } from './markdown.js';
import { loadAllPosts, loadPost, postUrl, PostNotFoundError } from './posts.js';

const SITE_TITLE = 'my-blog';
const app = document.getElementById('app');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const dateFormat = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long' });

let navigationId = 0;
let rendered = false;

export async function showRoute(route) {
  // 화면 전환이 빠르게 이어질 때, 늦게 끝난 이전 요청이 최신 화면을 덮어쓰지 않게 한다.
  const id = ++navigationId;
  const isStale = () => id !== navigationId;

  if (!rendered) app.replaceChildren(buildState('불러오는 중…', '', { busy: true }));

  try {
    if (route.name === 'home') {
      const posts = await loadAllPosts();
      if (isStale()) return;
      display(buildList(posts), SITE_TITLE);
    } else if (route.name === 'post') {
      const post = await loadPost(route.slug);
      if (isStale()) return;
      display(buildPost(post), `${post.title} · ${SITE_TITLE}`);
    } else {
      displayNotFound();
    }
  } catch (error) {
    if (isStale()) return;
    if (error instanceof PostNotFoundError) {
      displayNotFound();
      return;
    }
    console.error(error);
    display(
      buildState('글을 불러오지 못했어요', '네트워크 상태를 확인한 뒤 다시 시도해 주세요.', { error: true }),
      `오류 · ${SITE_TITLE}`,
    );
  }
}

function display(node, title) {
  app.replaceChildren(node);
  document.title = title;
  if (rendered) {
    // 첫 화면 이후의 이동에서만: 맨 위로 올리고 스크린 리더가 새 내용을 읽도록 포커스를 옮긴다.
    window.scrollTo(0, 0);
    app.focus({ preventScroll: true });
  }
  rendered = true;
}

function displayNotFound() {
  display(
    buildState('페이지를 찾을 수 없어요', '주소가 올바른지 확인해 주세요.'),
    `찾을 수 없음 · ${SITE_TITLE}`,
  );
}

/* ---------- 화면 조각 ---------- */

function el(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

function formatDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  // 'YYYY-MM-DD'를 그대로 Date에 넣으면 시간대 때문에 하루가 밀릴 수 있어 직접 만든다.
  return dateFormat.format(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function buildMeta(post) {
  if (!post.date && post.tags.length === 0) return null;
  const meta = el('p', { class: 'post-meta' });
  if (post.date) meta.append(el('time', { datetime: post.date }, formatDate(post.date)));
  for (const tag of post.tags) meta.append(el('span', { class: 'tag' }, tag));
  return meta;
}

function buildState(title, message, { error = false, busy = false } = {}) {
  const box = el(
    'section',
    { class: 'state', role: error ? 'alert' : 'status' },
    el('h1', { class: 'state__title' }, title),
  );
  if (message) box.append(el('p', { class: 'state__message' }, message));
  if (!busy) box.append(el('a', { class: 'state__link', href: '#/' }, '목록으로 돌아가기'));
  return box;
}

function buildList(posts) {
  const view = el('div', {}, el('h1', { class: 'page-title' }, '최근 글'));
  if (posts.length === 0) {
    view.append(el('p', { class: 'state__message' }, '아직 올라온 글이 없어요.'));
    return view;
  }
  const list = el('ul', { class: 'post-list' });
  for (const post of posts) list.append(buildCard(post));
  view.append(list);
  return view;
}

function buildCard(post) {
  const link = el(
    'a',
    { class: 'post-card__link', href: `#/post/${encodeURIComponent(post.slug)}` },
    post.title,
  );
  const card = el('li', { class: 'post-card' }, el('h2', { class: 'post-card__title' }, link));
  const meta = buildMeta(post);
  if (meta) card.append(meta);
  if (post.summary) card.append(el('p', { class: 'post-card__summary' }, post.summary));
  return card;
}

function buildPost(post) {
  const header = el('header', { class: 'post__header' }, el('h1', { class: 'post__title' }, post.title));
  const meta = buildMeta(post);
  if (meta) header.append(meta);

  const body = el('div', { class: 'prose' });
  body.innerHTML = markdown(post.body, { baseUrl: postUrl(post.slug) });
  body.addEventListener('click', handleAnchorClick);

  return el(
    'article',
    { class: 'post' },
    el('a', { class: 'back-link', href: '#/' }, '← 목록'),
    header,
    body,
    el('a', { class: 'back-link back-link--bottom', href: '#/' }, '← 목록으로'),
  );
}

// 본문 안의 #제목 링크. 주소의 해시를 바꾸면 라우터가 다른 페이지로 오해하므로 직접 스크롤한다.
function handleAnchorClick(event) {
  const link = event.target.closest('a[href^="#"]');
  if (!link) return;

  const href = link.getAttribute('href');
  if (href.startsWith('#/')) return; // 사이트 안의 다른 글로 가는 링크는 라우터에 맡긴다.

  event.preventDefault();
  let id;
  try {
    id = decodeURIComponent(href.slice(1));
  } catch {
    return;
  }
  const target = [...event.currentTarget.querySelectorAll('[id]')].find((node) => node.id === id);
  target?.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth' });
}
