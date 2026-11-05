import data from '../data/scenes.json';
import { CONFIG } from './config';

// ---- データの形 ----
/** face：表情。"smile"（笑顔・ふつう）か "serious"（真剣） */
type Line = { speaker?: string; character?: string; face?: string; text: string };
type Scene = { background: string; lines: Line[] };
type Character = { name: string; color?: string; tie?: string; hair?: string; longHair?: boolean };

const characters = data.characters as Record<string, Character>;
const scenes = data.scenes as Record<string, Scene>;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** データの色が「#123abc」の形のときだけ使う（それ以外は決まった色） */
function safeColor(value: string | undefined, fallback: string): string {
  return value && /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback;
}

/** 人物の絵（図形で描いたシルエット。借り物の絵は使わない） */
function portrait(c: Character, face = 'smile'): SVGSVGElement {
  const serious = face === 'serious';
  const body = safeColor(c.color, '#4a5a6a');
  const hair = safeColor(c.hair, '#2d2a2a');
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 200 260');
  svg.setAttribute('class', 'novel-portrait');
  svg.setAttribute('aria-hidden', 'true');
  const shapes: [string, Record<string, string>][] = [];
  // 長い髪は顔の後ろに描く
  if (c.longHair) {
    shapes.push(['path', { d: 'M48 96 C44 40 80 30 100 30 C124 30 158 42 152 96 L156 170 L44 170 Z', fill: hair }]);
  }
  shapes.push(
    ['path', { d: 'M20 260 C20 190 60 160 100 160 C140 160 180 190 180 260 Z', fill: body }],
    ['path', { d: 'M82 162 L100 200 L118 162 Z', fill: '#f4f6f8' }],
  );
  // ネクタイは、データに色があるときだけ
  if (c.tie) {
    shapes.push(['path', { d: 'M96 172 L104 172 L108 232 L100 244 L92 232 Z', fill: safeColor(c.tie, '#888888') }]);
  }
  shapes.push(
    ['rect', { x: '86', y: '128', width: '28', height: '36', rx: '8', fill: '#e9c9a8' }],
    ['ellipse', { cx: '100', cy: '92', rx: '46', ry: '52', fill: '#f1d4b5' }],
    ['path', { d: 'M54 88 C52 46 80 34 102 34 C128 34 150 50 146 88 C138 66 120 58 100 60 C80 60 62 68 54 88 Z', fill: hair }],
    // まゆ・目・口
    ['path', {
      // 真剣な顔は、まゆを少し内側に下げる
      d: serious ? 'M72 81 Q82 82 92 86 M108 86 Q118 82 128 81' : 'M72 84 Q82 79 92 83 M108 83 Q118 79 128 84',
      stroke: '#3a2f2a', 'stroke-width': '3', fill: 'none', 'stroke-linecap': 'round',
    }],
    ['ellipse', { cx: '82', cy: '96', rx: '4', ry: '5', fill: '#2d2a2a' }],
    ['ellipse', { cx: '118', cy: '96', rx: '4', ry: '5', fill: '#2d2a2a' }],
    ['path', {
      d: serious ? 'M90 125 L110 125' : 'M88 122 Q100 130 112 122',
      stroke: '#9a5b4a', 'stroke-width': '3', fill: 'none', 'stroke-linecap': 'round',
    }],
  );
  for (const [tag, attrs] of shapes) {
    const s = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
    svg.append(s);
  }
  return svg;
}

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * ノベル場面を再生する。最後まで読む（または「飛ばす」）と onEnd を呼ぶ。
 * どの場面からも必ず抜けられる。
 */
export function playScene(sceneId: string, onEnd: () => void): void {
  const scene = scenes[sceneId];
  if (!scene) {
    onEnd();
    return;
  }

  const root = el('section', `novel bg-${scene.background.replace(/[^a-z0-9-]/gi, '')}`);
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', '会話の場面');
  root.tabIndex = -1;

  const stage = el('div', 'novel-stage');
  const figure = el('div', 'novel-figure');
  stage.append(figure);

  const box = el('div', 'novel-box');
  const nameTag = el('div', 'novel-name');
  const text = el('p', 'novel-text');
  text.setAttribute('aria-live', 'polite');
  const next = el('span', 'novel-next', `▼ ${data.ui.next}`);
  box.append(nameTag, text, next);

  const skip = el('button', 'novel-skip', `${data.ui.skip} ⏭`);
  skip.type = 'button';

  root.append(stage, box, skip);
  document.getElementById('app')!.append(root);

  let index = -1;
  let typing = 0;
  let shownCharacter = '';
  let full = '';

  const finishTyping = () => {
    window.clearInterval(typing);
    typing = 0;
    text.textContent = full;
    next.classList.add('is-ready');
  };

  const end = () => {
    window.clearInterval(typing);
    document.removeEventListener('keydown', onKey);
    root.remove();
    onEnd();
  };

  const show = (i: number) => {
    const line = scene.lines[i];
    // 人物の絵（変わったときだけ描き直す）
    const charId = line.character ?? '';
    const face = line.face ?? 'smile';
    const key = `${charId}:${face}`;
    if (key !== shownCharacter) {
      const sameCharacter = shownCharacter.split(':')[0] === charId;
      figure.replaceChildren();
      const c = characters[charId];
      if (c && charId !== 'me') {
        const p = portrait(c, face);
        // 表情が変わるだけのときは、下から出てくる動きをつけない
        if (sameCharacter) p.classList.add('no-rise');
        figure.append(p);
      }
      shownCharacter = key;
    }
    // 話している人の絵を明るく、聞いている人の絵を少し暗く
    figure.classList.toggle('is-listening', !!line.speaker && line.speaker !== line.character);

    const speaker = line.speaker ? characters[line.speaker] : undefined;
    nameTag.textContent = speaker?.name ?? '';
    nameTag.hidden = !speaker;
    nameTag.classList.toggle('is-me', line.speaker === 'me');
    box.classList.toggle('is-narration', !speaker);

    full = line.text;
    next.classList.remove('is-ready');
    if (reduceMotion || CONFIG.novelTextSpeedMs <= 0) {
      finishTyping();
      return;
    }
    let n = 0;
    text.textContent = '';
    typing = window.setInterval(() => {
      n += 1;
      text.textContent = full.slice(0, n);
      if (n >= full.length) finishTyping();
    }, CONFIG.novelTextSpeedMs);
  };

  const advance = () => {
    if (typing) {
      finishTyping(); // 1回目の押しで文を全部出す
      return;
    }
    index += 1;
    if (index >= scene.lines.length) end();
    else show(index);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      if (document.activeElement === skip) return; // 「飛ばす」はボタンとして押す
      e.preventDefault();
      advance();
    }
  };

  root.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.novel-skip')) return;
    advance();
  });
  skip.addEventListener('click', end);
  document.addEventListener('keydown', onKey);

  advance();
  root.focus();
}
