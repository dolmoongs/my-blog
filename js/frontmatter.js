// 마크다운 맨 위의 front matter(--- 로 감싼 블록)를 분리한다.
// 지원 형식: `key: value` 한 줄, 그리고 `key: [a, b]` 형태의 배열. 그 외 YAML 문법은 지원하지 않는다.

const FRONT_MATTER = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

export function parseFrontMatter(source) {
  const text = source.replace(/^﻿/, '');
  const match = FRONT_MATTER.exec(text);
  if (!match) return { data: {}, body: text };
  return { data: parseBlock(match[1] ?? ''), body: text.slice(match[0].length) };
}

function parseBlock(block) {
  const data = {};
  for (const line of block.split(/\r?\n/)) {
    const entry = /^([A-Za-z0-9_-]+)[ \t]*:[ \t]*(.*)$/.exec(line);
    if (entry) data[entry[1]] = parseValue(entry[2].trim());
  }
  return data;
}

function parseValue(raw) {
  if (raw.startsWith('[') && raw.endsWith(']')) {
    return raw
      .slice(1, -1)
      .split(',')
      .map((item) => unquote(item.trim()))
      .filter(Boolean);
  }
  return unquote(raw);
}

function unquote(value) {
  const quote = value[0];
  if (value.length >= 2 && (quote === '"' || quote === "'") && value.endsWith(quote)) {
    return value.slice(1, -1);
  }
  return value;
}
