# my-blog

마크다운(`.md`) 파일을 읽어 블로그 웹사이트로 변환해 보여주는 정적 사이트 프로젝트.

> 상태: 1단계 구현 완료 (글 목록, 글 보기, 마크다운 변환, 다크 모드, 반응형). 다음은 2단계 검색 — `js/search.js` 추가, 라우트 `#/search?q=...`.

## 기술 제약 (반드시 지킬 것)

- **HTML, CSS, JavaScript만 사용한다.** React/Vue 등 프레임워크, Tailwind/Bootstrap 같은 CSS 프레임워크, TypeScript, 번들러(Webpack/Vite 등)는 쓰지 않는다.
- **빌드 단계 없음.** 파일을 수정하면 새로고침만으로 바로 반영돼야 한다. `package.json`, `node_modules`를 만들지 않는다.
- **외부 CDN/라이브러리 의존 없음.** 마크다운 파서도 `js/markdown.js`에 직접 구현한다. 폰트는 시스템 폰트 스택을 쓴다(웹폰트 금지).
- JavaScript는 ES Modules(`<script type="module">`)와 최신 브라우저 표준 API(`fetch`, `URL`, `matchMedia` 등)만 사용한다.
- 정적 호스팅(GitHub Pages 등)에서 그대로 동작해야 한다. 서버 코드를 추가하지 않는다.

## 프로젝트 구조

```
my-blog/
├── index.html            # 유일한 HTML 진입점 (SPA 셸)
├── css/
│   ├── base.css          # 리셋, CSS 변수(색상/간격/글꼴), 다크 모드 변수
│   ├── layout.css        # 헤더, 푸터, 컨테이너, 반응형 레이아웃
│   ├── components.css    # 글 목록 카드, 버튼, 태그, 테마 토글
│   └── prose.css         # 마크다운 본문(.prose) 스타일
├── js/
│   ├── main.js           # 진입점: 초기화, 라우터 연결
│   ├── router.js         # 해시 라우팅 (#/ , #/post/<slug>)
│   ├── posts.js          # 글 목록/본문 fetch
│   ├── frontmatter.js    # 마크다운 상단 front matter 파싱
│   ├── markdown.js       # 마크다운 → HTML 변환기
│   ├── render.js         # 목록/글 화면 렌더링
│   └── theme.js          # 다크/라이트 모드 전환
├── posts/
│   ├── index.json        # 글 목록 (slug 배열)
│   └── <slug>.md         # 블로그 글 원본
└── assets/               # 이미지 등 정적 파일
```

## 동작 방식

1. `index.html`이 로드되면 `main.js`가 `posts/index.json`에서 글 목록을 읽는다.
2. 각 `.md` 파일을 `fetch`로 가져와 `frontmatter.js`로 메타데이터를 분리하고, 본문은 `markdown.js`로 HTML로 변환한다.
3. 라우팅은 **해시 기반**(`#/`, `#/post/<slug>`)으로 한다. 정적 호스팅에서 서버 설정 없이 새로고침/직접 링크가 동작하게 하기 위해서다.
4. `fetch`는 `file://`에서 막히므로 **반드시 로컬 서버로 실행**한다.

### 로컬 실행

```bash
python -m http.server 8000
```

그다음 `http://localhost:8000` 접속. (Python이 없으면 `npx serve` 사용 — 단, 프로젝트에 설치하지 말 것.)

## 글 작성 규칙

- 새 글은 `posts/<slug>.md`로 만들고 `posts/index.json`에 slug를 추가한다. slug는 소문자 영문/숫자/하이픈만 쓴다.
- 파일 맨 위에 front matter를 둔다.

```markdown
---
title: 글 제목
date: 2026-01-31
tags: [javascript, 회고]
summary: 목록에 보여줄 한두 줄 요약
---

본문은 여기서부터…
```

- `title`, `date`(YYYY-MM-DD)는 필수. `tags`, `summary`는 선택.
- 글 목록은 `date` 내림차순으로 정렬한다.

## 마크다운 변환기 요구사항

지원 문법: 제목(h1–h6), 문단, 굵게/기울임/취소선, 인라인 코드, 코드 블록(언어 표기 포함), 링크, 이미지, 순서/비순서 목록(중첩 포함), 인용문, 표, 수평선.

- **HTML 이스케이프가 기본이다.** 마크다운 원문의 `<`, `>`, `&`는 이스케이프하고, 링크의 `javascript:` 같은 위험한 URL 스킴은 차단한다.
- 코드 블록 안의 내용은 마크다운으로 해석하지 않는다.
- 제목에는 `id`(slug화)를 붙여 앵커 링크가 가능하게 한다.
- 변환기는 순수 함수(`markdown(text, { baseUrl }) → htmlString`)로 만들어 DOM에 의존하지 않게 한다.
- 미지원 문법: 들여쓰기 코드 블록, 밑줄(setext) 제목, 각주, 원시 HTML(항상 이스케이프). 필요해지면 추가하되, 지원 범위를 바꾸면 이 목록도 고친다.
- 글 안의 상대 경로(이미지, 링크)는 **글 파일(`posts/<slug>.md`) 위치 기준**으로 해석한다. 이미지는 `![설명](../assets/파일.png)`처럼 쓴다.
- 본문의 `#제목` 앵커 링크는 `render.js`가 클릭을 가로채 스크롤만 한다. 해시를 직접 바꾸면 해시 라우터가 다른 페이지로 오해하기 때문이다. 다른 글로 가는 링크는 `[글](#/post/<slug>)` 형식을 쓴다.
- 변환기를 고치면 `markdown(...)`을 콘솔이나 Node(`import`)에서 직접 불러 XSS 입력(`<script>`, `javascript:` 링크, `onerror` 속성)이 막히는지 다시 확인한다.

## 디자인 가이드

**원칙: 깔끔하고 읽기 좋게.** 장식보다 가독성이 우선이다.

- 본문 폭은 `max-width: 42rem`(약 680px) 안팎으로 제한하고 가운데 정렬한다.
- 본문 글자 크기 `1.0625rem`(17px) 이상, `line-height: 1.75` 안팎, 문단 간격은 넉넉하게.
- 글꼴은 시스템 스택: `system-ui, -apple-system, "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`. 코드는 `ui-monospace, SFMono-Regular, Consolas, monospace`.
- 한글 가독성을 위해 본문에 `word-break: keep-all`, `overflow-wrap: break-word`를 적용한다.
- 색상은 절제한다: 배경/본문/보조 텍스트/구분선/강조색(1개) 정도만 쓴다.
- 색상·간격·반경 등은 **모두 CSS 변수**(`:root`)로 정의하고, 하드코딩된 색상값을 컴포넌트에 직접 쓰지 않는다.

### 다크 모드

- 기본값은 OS 설정(`prefers-color-scheme`)을 따르고, 헤더의 토글 버튼으로 사용자가 직접 바꿀 수 있다. 선택은 `localStorage`에 저장한다.
- 구현: `<html data-theme="light|dark">` 속성 + CSS 변수 덮어쓰기. 라이트/다크 변수는 `base.css`에서만 정의한다.
- **깜빡임(FOUC) 방지:** 테마 결정 코드는 `<head>`의 짧은 인라인 스크립트로 두어 첫 렌더 전에 `data-theme`을 설정한다.
- 다크 모드에서도 본문 대비는 WCAG AA(4.5:1) 이상을 유지한다. 순수 `#000`/`#fff` 대신 눈이 덜 부신 부드러운 색(예: 짙은 회청색 배경, 밝은 회색 글자)을 쓴다.
- 코드 블록, 표, 인용문, 이미지(필요 시 밝기 조절)도 두 테마에서 모두 확인한다.

### 모바일 / 반응형

- **모바일 퍼스트**로 작성한다: 기본 스타일이 모바일, `min-width` 미디어쿼리로 확장.
- `<meta name="viewport" content="width=device-width, initial-scale=1">` 필수.
- 좌우 여백 최소 `1rem`. 가로 스크롤이 생기면 안 된다 — 긴 코드 블록과 표는 **자기 자신만** `overflow-x: auto`로 스크롤시킨다.
- 이미지는 `max-width: 100%; height: auto`.
- 터치 대상(버튼, 링크)은 최소 44×44px.
- 브레이크포인트는 `40rem`(태블릿), `64rem`(데스크톱) 두 개만 쓴다.

### 접근성

- 시맨틱 태그(`header`, `main`, `article`, `nav`, `footer`)를 사용한다.
- 테마 토글은 `<button>`이며 `aria-label`과 `aria-pressed`를 제공한다.
- 키보드 포커스 표시(`:focus-visible`)를 없애지 않는다.
- 라우트 전환 시 `document.title`을 갱신하고 `<main>`으로 포커스를 이동한다.
- `prefers-reduced-motion`을 존중한다.

## 코드 컨벤션

- 들여쓰기 2칸, 세미콜론 사용, 문자열은 작은따옴표, `const`/`let`만 사용(`var` 금지).
- 전역 변수 금지. 모듈 단위로 `export`/`import` 한다.
- 모듈은 한 가지 역할만 맡는다. 파싱(`markdown.js`, `frontmatter.js`)은 DOM을 모르고, 화면 그리기(`render.js`)만 DOM을 만진다.
- 동적 HTML을 넣을 때: 마크다운 변환 결과만 `innerHTML`에 넣고, 그 외 사용자/파일 유래 문자열(제목, 태그 등)은 `textContent` 또는 이스케이프 함수를 거친다.
- `fetch` 실패(404, 네트워크 오류)는 반드시 처리해 사용자에게 안내 화면을 보여준다.
- CSS: 클래스 기반, BEM 비슷한 단순 네이밍(`.post-card`, `.post-card__title`). `id` 선택자와 `!important`는 쓰지 않는다.
- 주석은 "왜"를 설명할 때만 쓴다.

## 작업 시 주의

- 위 기술 제약(프레임워크/빌드/외부 의존 금지)을 어기는 제안은 먼저 사용자에게 물어본다.
- 기능을 추가하면 라이트/다크, 모바일(약 375px 폭)/데스크톱 모두에서 직접 확인한다.
- 새 글 샘플이나 문서 파일을 사용자가 요청하지 않았는데 대량으로 만들지 않는다.
