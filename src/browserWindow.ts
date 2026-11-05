import data from '../data/browser.json';
import { getClip, onClipChange, setClip, type Clip } from './clipboard';

// ---- 検索の判定 ----
type Result = { title: string; url: string; lines: string[]; copyable?: boolean; notFound?: boolean };
type Rule = { id: string; keywords: string[]; results: Result[] };
const rules = data.rules as Rule[];
const fallback = { id: 'fallback', results: data.fallback.results as Result[] };
export const browserUi = data.ui;

function normalize(s: string): string {
  return s.normalize('NFKC').toLowerCase();
}

export function search(query: string): { id: string; results: Result[] } {
  const text = normalize(query);
  for (const r of rules) {
    if (r.keywords.some((k) => text.includes(normalize(k)))) return r;
  }
  return fallback;
}

// ---- 状態（ウィンドウを閉じても残す） ----
let lastQuery = '';
let lastResults: { id: string; results: Result[] } | null = null;
/** 結果ごとのコピー用データ（同じものを使い回して「コピー中」を判定する） */
const clips = new Map<string, Clip>();

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/**
 * ブラウザのウィンドウの中身。onSearch：検索したとき（結果のid）。
 * onCopy：結果をコピーしたとき。notify：短いお知らせ。
 */
export function buildBrowserBody(
  onSearch: (ruleId: string, query: string) => void,
  onCopy: (clip: Clip) => void,
  notify: (message: string) => void,
): { body: HTMLElement; cleanup: () => void; focus: () => void } {
  const body = el('div', 'browser-body');

  const form = el('form', 'browser-bar');
  const input = el('input', 'browser-input');
  input.type = 'search';
  input.placeholder = browserUi.placeholder;
  input.setAttribute('aria-label', browserUi.placeholder);
  input.value = lastQuery;
  const paste = el('button', 'ai-paste', browserUi.paste);
  paste.type = 'button';
  const go = el('button', 'primary-btn browser-go', browserUi.search);
  go.type = 'submit';
  form.append(paste, input, go);

  const page = el('div', 'browser-page');
  page.setAttribute('aria-live', 'polite');
  body.append(form, page);

  const copyButtons: (() => void)[] = [];
  const renderCopies = () => copyButtons.forEach((fn) => fn());

  const render = () => {
    page.replaceChildren();
    copyButtons.length = 0;
    if (!lastResults) {
      page.append(el('p', 'browser-hint', browserUi.start));
      return;
    }
    const shown = lastQuery.length > 30 ? `${lastQuery.slice(0, 30)}…` : lastQuery;
    page.append(el('p', 'browser-hint', `「${shown}」${browserUi.resultsFor}`));
    lastResults.results.forEach((r, i) => {
      const card = el('article', `browser-result${r.notFound ? ' is-not-found' : ''}`);
      card.append(el('h3', 'browser-result-title', `${r.notFound ? '⚠ ' : ''}${r.title}`));
      if (r.url) card.append(el('p', 'browser-result-url', r.url));
      for (const line of r.lines) card.append(el('p', 'browser-result-line', line));
      if (r.copyable) {
        const key = `${lastResults!.id}:${i}`;
        let clip = clips.get(key);
        if (!clip) {
          clip = { sourceId: `web:${key}`, behavior: 0, lines: [...r.lines.filter((l) => !l.startsWith('※')), `出典：${r.title}（${r.url}）`] };
          clips.set(key, clip);
        }
        const c = clip;
        const copy = el('button', 'copy-btn');
        copy.type = 'button';
        const renderCopy = () => {
          const active = getClip() === c;
          copy.textContent = active ? browserUi.copied : browserUi.copy;
          copy.classList.toggle('is-active', active);
          copy.setAttribute('aria-pressed', String(active));
        };
        renderCopy();
        copyButtons.push(renderCopy);
        copy.addEventListener('click', () => {
          setClip(c);
          onCopy(c);
        });
        card.append(copy);
      }
      page.append(card);
    });
  };
  render();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) {
      input.focus();
      return;
    }
    lastQuery = q;
    lastResults = search(q);
    render();
    page.scrollTop = 0;
    onSearch(lastResults.id, q);
  });

  paste.addEventListener('click', () => {
    const c = getClip();
    if (!c) {
      notify(browserUi.noClip);
      return;
    }
    input.value = c.lines.join(' ');
    input.focus();
  });

  const off = onClipChange(renderCopies);
  return { body, cleanup: off, focus: () => input.focus() };
}
