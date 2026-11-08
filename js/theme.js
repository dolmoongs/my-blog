// 다크/라이트 모드. 사용자가 고른 값(localStorage)이 OS 설정보다 우선한다.
// 첫 렌더 전의 초기 테마는 index.html의 인라인 스크립트가 정하고, 여기서는 토글과 이후 변화를 맡는다.

const STORAGE_KEY = 'theme';
const root = document.documentElement;
const systemDark = matchMedia('(prefers-color-scheme: dark)');

function readStored() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function store(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // 저장이 막힌 환경(사생활 보호 모드 등)에서는 이번 방문에만 적용된다.
  }
}

function apply(theme, button) {
  root.dataset.theme = theme;
  button.setAttribute('aria-pressed', String(theme === 'dark'));
}

export function initTheme(button) {
  let chosen = readStored();
  const resolve = () => chosen ?? (systemDark.matches ? 'dark' : 'light');

  apply(resolve(), button);

  button.addEventListener('click', () => {
    chosen = root.dataset.theme === 'dark' ? 'light' : 'dark';
    store(chosen);
    apply(chosen, button);
  });

  // 직접 고른 적이 없으면 OS 설정 변화를 그대로 따라간다.
  systemDark.addEventListener('change', () => {
    if (chosen === null) apply(resolve(), button);
  });
}
