import ai from '../data/ai-assistant.json';
import { CONFIG } from './config';
import { getClip, setClip, type Clip } from './clipboard';

// ---- 入力の判定（どの返答・どの行動に当てはまるか） ----
export type Match = { id: string; behavior: number; reply: string[] };

function normalize(s: string): string {
  // 全角英数・半角カナなどをそろえ、大文字小文字の違いをなくす
  return s.normalize('NFKC').toLowerCase();
}

export function matchInput(input: string): Match {
  const text = normalize(input);
  for (const rule of ai.rules) {
    if (rule.keywords.some((k) => text.includes(normalize(k)))) {
      return { id: rule.id, behavior: rule.behavior, reply: rule.reply };
    }
  }
  return ai.fallback;
}

// ---- 会話の記録（ウィンドウを閉じても残す） ----
/** clip があるAIの返答は、資料にコピーできる */
type Msg = { from: 'ai' | 'me'; lines: string[]; clip?: Clip };
const history: Msg[] = [{ from: 'ai', lines: [ai.greeting] }];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

const COPY_LABEL = '📋 コピー';
const COPIED_LABEL = '✓ コピー中';

function bubble(m: Msg, onCopy: (clip: Clip) => void): HTMLElement {
  const b = el('div', `ai-msg from-${m.from}`);
  b.append(el('span', 'ai-who', m.from === 'ai' ? '🤖 AI' : 'あなた'));
  const body = el('div', 'ai-text');
  for (const line of m.lines) body.append(el('p', '', line || ' '));
  b.append(body);

  if (m.clip) {
    const clip = m.clip;
    const copy = el('button', 'copy-btn');
    copy.type = 'button';
    const render = () => {
      const active = getClip() === clip;
      copy.textContent = active ? COPIED_LABEL : COPY_LABEL;
      copy.classList.toggle('is-active', active);
      copy.setAttribute('aria-pressed', String(active));
    };
    render();
    copy.addEventListener('click', () => {
      setClip(clip);
      // ほかの返答のボタンを「コピー」に戻す
      b.parentElement?.querySelectorAll<HTMLButtonElement>('.copy-btn').forEach((btn) => {
        btn.textContent = COPY_LABEL;
        btn.classList.remove('is-active');
        btn.setAttribute('aria-pressed', 'false');
      });
      render();
      onCopy(clip);
    });
    b.append(copy);
  }
  return b;
}

/** AIアシスタントのウィンドウの中身をつくる。onMatch で判定結果を、onCopy でコピーを外に伝える */
export function buildAiBody(
  onMatch: (m: Match, input: string) => void,
  onCopy: (clip: Clip) => void,
  notify: (message: string) => void,
): {
  body: HTMLElement;
  focus: () => void;
} {
  const body = el('div', 'ai-body');
  const log = el('div', 'ai-log');
  log.setAttribute('role', 'log');
  log.setAttribute('aria-live', 'polite');
  for (const m of history) log.append(bubble(m, onCopy));

  const form = el('form', 'ai-form');
  const input = el('textarea', 'ai-input');
  input.rows = 2;
  input.placeholder = ai.placeholder;
  input.setAttribute('aria-label', ai.placeholder);
  const send = el('button', 'primary-btn ai-send', ai.sendButton);
  send.type = 'submit';
  // コピーしたもの（メールの添付など）を入力欄に貼る
  const paste = el('button', 'ai-paste', ai.pasteButton);
  paste.type = 'button';
  paste.addEventListener('click', () => {
    const c = getClip();
    if (!c) {
      notify(ai.noClip);
      return;
    }
    const pasted = c.lines.join('\n');
    input.value = input.value.trim() ? `${input.value.trimEnd()}\n${pasted}` : pasted;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    input.scrollTop = input.scrollHeight;
  });
  form.append(paste, input, send);
  body.append(log, form);

  const scrollDown = () => {
    log.scrollTop = log.scrollHeight;
  };
  requestAnimationFrame(scrollDown);

  let busy = false;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || busy) {
      input.focus();
      return;
    }
    busy = true;
    send.disabled = true;

    // 送った瞬間に自分の発言を出す（反応の遅れをつくらない）
    const mine: Msg = { from: 'me', lines: text.split('\n') };
    history.push(mine);
    log.append(bubble(mine, onCopy));
    input.value = '';

    const thinking = el('div', 'ai-msg from-ai is-thinking');
    thinking.append(el('span', 'ai-who', '🤖 AI'), el('div', 'ai-text', ai.thinking));
    log.append(thinking);
    scrollDown();

    const match = matchInput(text);
    window.setTimeout(() => {
      thinking.remove();
      // 「もう少し具体的に」以外の返答は、資料にコピーできる
      const reply: Msg = {
        from: 'ai',
        lines: match.reply,
        clip: match.id === 'fallback' ? undefined : { sourceId: match.id, behavior: match.behavior, lines: match.reply },
      };
      history.push(reply);
      log.append(bubble(reply, onCopy));
      scrollDown();
      busy = false;
      send.disabled = false;
      onMatch(match, text);
    }, CONFIG.aiReplyDelayMs);
  });

  // Enterで送る。Shift+Enterで改行。日本語の変換中のEnterは送らない
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  return { body, focus: () => input.focus() };
}
