// 마크다운 → HTML 변환기.
// DOM에 의존하지 않는 순수 모듈이라 브라우저 콘솔이나 Node에서도 단독으로 검증할 수 있다.
//
// 지원: 제목(#), 문단, 굵게/기울임/취소선, 인라인 코드, 코드 펜스, 링크, 이미지,
//       목록(중첩), 인용문, 표, 수평선, 자동 링크.
// 미지원: 들여쓰기 코드 블록, 밑줄(setext) 제목, 원시 HTML(항상 이스케이프), 각주.
//
// 보안: 원문의 < > & " ' 는 모두 이스케이프하고, 링크/이미지 URL은 http, https, mailto,
//       상대 경로, # 만 허용한다. (javascript: 등은 링크를 만들지 않고 글자만 남긴다.)

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const HTML_UNESCAPES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

const SAFE_SCHEMES = new Set(['http', 'https', 'mailto']);

const ATX_HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const HORIZONTAL_RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const BLOCKQUOTE = /^ {0,3}>/;
const LIST_ITEM = /^([ \t]*)([-*+]|(\d{1,9})[.)])([ \t]+|$)(.*)$/;
const TABLE_DELIMITER = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

// 이미지/링크는 이스케이프가 끝난 텍스트에 적용한다. URL에는 한 단계 괄호까지 허용한다.
const URL_PART = '((?:[^\\s()]|\\([^\\s()]*\\))*)';
const TITLE_PART = '(?:\\s+&quot;(.*?)&quot;)?';
const IMAGE = new RegExp(`!\\[([^\\]]*)\\]\\(${URL_PART}${TITLE_PART}\\s*\\)`, 'g');
const LINK = new RegExp(`\\[([^\\]]+)\\]\\(${URL_PART}${TITLE_PART}\\s*\\)`, 'g');

export function markdown(source, options = {}) {
  const lines = String(source)
    .replace(/\u0000/g, '') // 인라인 처리에서 자리표시자로 쓰는 문자
    .replace(/\r\n?/g, '\n')
    .split('\n');
  return renderBlocks(lines, { slugs: new Map(), baseUrl: options.baseUrl ?? null });
}

/* ---------- 공통 도우미 ---------- */

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

function unescapeHtml(text) {
  return text.replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => HTML_UNESCAPES[entity]);
}

function isBlank(line) {
  return line.trim() === '';
}

// 탭은 4칸 단위로 계산한다.
function indentWidth(line) {
  let width = 0;
  for (const ch of line) {
    if (ch === ' ') width += 1;
    else if (ch === '\t') width += 4 - (width % 4);
    else break;
  }
  return width;
}

function stripIndent(line, width) {
  let consumed = 0;
  let index = 0;
  while (index < line.length && consumed < width) {
    if (line[index] === ' ') {
      consumed += 1;
    } else if (line[index] === '\t') {
      const next = consumed + 4 - (consumed % 4);
      if (next > width) break;
      consumed = next;
    } else {
      break;
    }
    index += 1;
  }
  return line.slice(index);
}

/* ---------- 블록 ---------- */

function renderBlocks(lines, ctx, { tight = false } = {}) {
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) {
      i += 1;
      continue;
    }

    const fence = matchFence(line);
    if (fence) {
      const result = parseFence(lines, i, fence);
      out.push(result.html);
      i = result.next;
      continue;
    }

    const heading = ATX_HEADING.exec(line);
    if (heading) {
      out.push(renderHeading(heading, ctx));
      i += 1;
      continue;
    }

    if (HORIZONTAL_RULE.test(line)) {
      out.push('<hr>');
      i += 1;
      continue;
    }

    if (BLOCKQUOTE.test(line)) {
      const inner = [];
      while (i < lines.length && BLOCKQUOTE.test(lines[i])) {
        inner.push(lines[i].replace(/^ {0,3}> ?/, ''));
        i += 1;
      }
      out.push(`<blockquote>\n${renderBlocks(inner, ctx)}\n</blockquote>`);
      continue;
    }

    if (matchListItem(line)) {
      const result = parseList(lines, i, ctx);
      out.push(result.html);
      i = result.next;
      continue;
    }

    if (isTableStart(lines, i)) {
      const result = parseTable(lines, i, ctx);
      out.push(result.html);
      i = result.next;
      continue;
    }

    // 문단: 빈 줄이나 다른 블록이 시작될 때까지 이어 붙인다.
    const paragraph = [line.trimStart()];
    i += 1;
    while (i < lines.length && !isBlank(lines[i]) && !startsBlock(lines[i])) {
      paragraph.push(lines[i].trimStart());
      i += 1;
    }
    const inline = renderInline(paragraph.join('\n').trimEnd(), ctx);
    out.push(tight ? inline : `<p>${inline}</p>`);
  }

  return out.join('\n');
}

// 문단 중간에 끼어들어 새 블록을 시작할 수 있는 줄인가?
function startsBlock(line) {
  if (matchFence(line) || ATX_HEADING.test(line) || HORIZONTAL_RULE.test(line) || BLOCKQUOTE.test(line)) {
    return true;
  }
  const item = matchListItem(line);
  return item !== null && item.text !== '' && (!item.ordered || item.number === 1);
}

function renderHeading(match, ctx) {
  const level = match[1].length;
  const html = renderInline(match[2] ?? '', ctx);
  return `<h${level} id="${makeId(html, ctx)}">${html}</h${level}>`;
}

// 제목 id: 한글을 유지하는 slug. 같은 제목이 또 나오면 -1, -2 ... 를 붙인다.
function makeId(html, ctx) {
  const text = html.replace(/<[^>]*>/g, '').replace(/&[#\w]+;/g, '');
  const base =
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .trim()
      .replace(/\s+/g, '-') || 'section';
  const count = ctx.slugs.get(base) ?? 0;
  ctx.slugs.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
}

/* ---------- 코드 펜스 ---------- */

function matchFence(line) {
  const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match) return null;
  const [, indent, marks, rest] = match;
  if (marks[0] === '`' && rest.includes('`')) return null; // ```코드``` 같은 인라인 코드
  return { indent: indent.length, marks, lang: rest.trim().split(/\s+/)[0] };
}

function closesFence(line, fence) {
  const match = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
  return match !== null && match[1][0] === fence.marks[0] && match[1].length >= fence.marks.length;
}

function parseFence(lines, start, fence) {
  const code = [];
  let i = start + 1;
  while (i < lines.length && !closesFence(lines[i], fence)) {
    code.push(stripIndent(lines[i], fence.indent));
    i += 1;
  }
  const lang = fence.lang.replace(/[^A-Za-z0-9_+-]/g, '');
  const attr = lang ? ` class="language-${lang}"` : '';
  return {
    html: `<pre><code${attr}>${escapeHtml(code.join('\n'))}</code></pre>`,
    next: i < lines.length ? i + 1 : i, // 닫는 펜스가 없으면 문서 끝까지가 코드
  };
}

/* ---------- 목록 ---------- */

function matchListItem(line) {
  if (HORIZONTAL_RULE.test(line)) return null;
  const match = LIST_ITEM.exec(line);
  if (!match) return null;
  return {
    indent: indentWidth(match[1]),
    markerWidth: match[2].length,
    ordered: match[3] !== undefined,
    number: match[3] === undefined ? 0 : Number(match[3]),
    gap: match[4].replace(/\t/g, '    ').length,
    text: match[5],
  };
}

function parseList(lines, start, ctx) {
  const first = matchListItem(lines[start]);
  const items = [];
  let loose = false;
  let i = start;
  let item = first;

  while (item) {
    const contentIndent = item.indent + item.markerWidth + (item.text === '' || item.gap > 4 ? 1 : item.gap);
    const itemLines = [item.text];
    let pendingBlanks = 0;
    i += 1;

    while (i < lines.length) {
      const line = lines[i];

      if (isBlank(line)) {
        pendingBlanks += 1;
        i += 1;
        continue;
      }

      // 항목 내용으로 들여쓴 줄 (중첩 목록, 이어지는 문단, 코드 등)
      if (indentWidth(line) >= contentIndent) {
        if (pendingBlanks > 0) loose = true;
        for (let blank = 0; blank < pendingBlanks; blank += 1) itemLines.push('');
        pendingBlanks = 0;
        itemLines.push(stripIndent(line, contentIndent));
        i += 1;
        continue;
      }

      // 같은 목록의 다음 항목이거나 다른 목록의 시작
      const other = matchListItem(line);
      if (other && other.indent < contentIndent) break;

      // 들여쓰지 않고 이어 쓴 문단 줄
      if (pendingBlanks === 0 && !startsBlock(line)) {
        itemLines.push(line.trim());
        i += 1;
        continue;
      }
      break;
    }

    items.push(itemLines);

    const next = i < lines.length ? matchListItem(lines[i]) : null;
    if (next && next.ordered === first.ordered && next.indent < contentIndent) {
      if (pendingBlanks > 0) loose = true;
      item = next;
    } else {
      item = null;
    }
  }

  const tag = first.ordered ? 'ol' : 'ul';
  const startAttr = first.ordered && first.number !== 1 ? ` start="${first.number}"` : '';
  const body = items
    .map((itemLines) => `<li>${renderBlocks(itemLines, ctx, { tight: !loose })}</li>`)
    .join('\n');
  return { html: `<${tag}${startAttr}>\n${body}\n</${tag}>`, next: i };
}

/* ---------- 표 ---------- */

function splitRow(line) {
  let text = line.trim();
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1);

  const cells = [];
  let cell = '';
  for (let k = 0; k < text.length; k += 1) {
    if (text[k] === '\\' && text[k + 1] === '|') {
      cell += '|';
      k += 1;
    } else if (text[k] === '|') {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += text[k];
    }
  }
  cells.push(cell.trim());
  return cells;
}

function isTableStart(lines, i) {
  if (i + 1 >= lines.length) return false;
  if (!lines[i].includes('|') || !TABLE_DELIMITER.test(lines[i + 1])) return false;
  return splitRow(lines[i]).length === splitRow(lines[i + 1]).length;
}

function alignOf(cell) {
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';
  return null;
}

function parseTable(lines, start, ctx) {
  const headers = splitRow(lines[start]);
  const aligns = splitRow(lines[start + 1]).map(alignOf);
  const rows = [];
  let i = start + 2;
  while (i < lines.length && !isBlank(lines[i]) && lines[i].includes('|')) {
    rows.push(splitRow(lines[i]));
    i += 1;
  }

  const cell = (tag, text, index) => {
    const style = aligns[index] ? ` style="text-align:${aligns[index]}"` : '';
    return `<${tag}${style}>${renderInline(text, ctx)}</${tag}>`;
  };
  const head = `<tr>${headers.map((text, index) => cell('th', text, index)).join('')}</tr>`;
  const body = rows
    .map((row) => `<tr>${headers.map((_, index) => cell('td', row[index] ?? '', index)).join('')}</tr>`)
    .join('\n');

  // 가로로 넘치는 표가 페이지 전체가 아니라 표 영역만 스크롤되도록 감싼다.
  const html = `<div class="table-wrap"><table>\n<thead>${head}</thead>\n<tbody>\n${body}\n</tbody>\n</table></div>`;
  return { html, next: i };
}

/* ---------- 인라인 ---------- */

function renderInline(text, ctx) {
  const tokens = [];
  const stash = (html) => {
    tokens.push(html);
    return `\u0000${tokens.length - 1}\u0000`;
  };
  const restore = (value) => value.replace(/\u0000(\d+)\u0000/g, (_, index) => restore(tokens[Number(index)]));

  let s = text;

  // 1. 인라인 코드: 안쪽은 더 이상 해석하지 않는다.
  s = s.replace(/(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g, (_, __, code) => {
    let content = code.replace(/\n/g, ' ');
    if (content.length > 2 && content.startsWith(' ') && content.endsWith(' ') && content.trim() !== '') {
      content = content.slice(1, -1);
    }
    return stash(`<code>${escapeHtml(content)}</code>`);
  });

  // 2. 백슬래시 이스케이프: \* → 글자 그대로의 *
  s = s.replace(/\\([\\`*_{}[\]()#+\-.!|~<>"&'])/g, (_, ch) => stash(escapeHtml(ch)));

  // 3. <https://...> 자동 링크
  s = s.replace(/<((?:https?:\/\/|mailto:)[^\s<>]+)>/g, (_, url) => {
    const escaped = escapeHtml(url);
    return stash(buildLink(escaped, escaped, ctx));
  });

  // 4. 나머지 텍스트의 HTML 이스케이프 (이 아래 단계는 모두 이스케이프된 텍스트에서 동작한다)
  s = escapeHtml(s);

  // 5. 이미지, 링크
  s = s.replace(IMAGE, (_, alt, url, title) => stash(buildImage(alt, url, title, ctx)));
  s = s.replace(LINK, (_, label, url, title) => stash(buildLink(url, applyEmphasis(label), ctx, title)));

  // 6. 문장 속 URL 자동 링크
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]+)/g, (_, lead, url) => {
    let href = url;
    let tail = '';
    for (;;) {
      const punctuation = /(?:[.,;:!?*]|&quot;|&#39;|&gt;)$/.exec(href);
      if (punctuation) {
        tail = punctuation[0] + tail;
        href = href.slice(0, -punctuation[0].length);
      } else if (href.endsWith(')') && count(href, '(') < count(href, ')')) {
        tail = `)${tail}`;
        href = href.slice(0, -1);
      } else {
        break;
      }
    }
    return lead + stash(buildLink(href, href, ctx)) + tail;
  });

  // 7. 강조, 줄바꿈
  s = applyEmphasis(s);
  s = s.replace(/(?: {2,}|\\)\n/g, '<br>\n');

  return restore(s);
}

function count(text, ch) {
  return text.split(ch).length - 1;
}

function applyEmphasis(text) {
  const word = '\\p{L}\\p{N}_';
  return text
    .replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(new RegExp(`(^|[^${word}])__(?=\\S)([\\s\\S]*?\\S)__(?![${word}])`, 'gu'), '$1<strong>$2</strong>')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>')
    .replace(/\*(?=\S)([^*]*?\S)\*/g, '<em>$1</em>')
    .replace(new RegExp(`(^|[^${word}])_(?=[^\\s_])([^_]*?[^\\s_])_(?![${word}])`, 'gu'), '$1<em>$2</em>');
}

// URL을 검사한다. 안전하지 않으면 null, 아니면 이스케이프된 href와 외부 링크 여부를 돌려준다.
// 상대 경로는 글 파일 위치(baseUrl)를 기준으로 풀어 준다. (예: ../assets/a.png)
function sanitizeUrl(escapedUrl, baseUrl) {
  const raw = unescapeHtml(escapedUrl).replace(/[\u0000- \u007f]/g, '');
  if (raw === '') return null;
  if (raw.startsWith('#')) return { href: escapeHtml(raw), external: false };

  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(raw);
  if (scheme) {
    const name = scheme[1].toLowerCase();
    if (!SAFE_SCHEMES.has(name)) return null;
    return { href: escapeHtml(raw), external: name !== 'mailto' };
  }

  if (baseUrl) {
    try {
      return { href: escapeHtml(new URL(raw, baseUrl).href), external: false };
    } catch {
      return null;
    }
  }
  return { href: escapeHtml(raw), external: false };
}

function buildLink(escapedUrl, innerHtml, ctx, escapedTitle) {
  const url = sanitizeUrl(escapedUrl, ctx.baseUrl);
  if (url === null) return innerHtml;
  const title = escapedTitle ? ` title="${escapedTitle}"` : '';
  const target = url.external ? ' target="_blank" rel="noopener noreferrer"' : '';
  return `<a href="${url.href}"${title}${target}>${innerHtml}</a>`;
}

function buildImage(alt, escapedUrl, escapedTitle, ctx) {
  const url = sanitizeUrl(escapedUrl, ctx.baseUrl);
  if (url === null) return alt;
  const title = escapedTitle ? ` title="${escapedTitle}"` : '';
  return `<img src="${url.href}" alt="${alt}"${title} loading="lazy">`;
}
