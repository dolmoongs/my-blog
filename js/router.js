// 해시 기반 라우터. 정적 호스팅에서 서버 설정 없이 새로고침/직접 링크가 동작한다.
//   #/            → 글 목록
//   #/post/<slug> → 글 보기
// 그 밖의 해시는 찾을 수 없는 페이지로 취급한다.

export function parseRoute(hash) {
  const path = hash.replace(/^#/, '');
  if (path === '' || path === '/') return { name: 'home' };

  const post = /^\/post\/([^/?#]+)\/?$/.exec(path);
  if (post) {
    try {
      return { name: 'post', slug: decodeURIComponent(post[1]) };
    } catch {
      return { name: 'notfound' };
    }
  }
  return { name: 'notfound' };
}

export function startRouter(onRoute) {
  const handle = () => onRoute(parseRoute(location.hash));
  window.addEventListener('hashchange', handle);
  handle();
}
