import data from '../data/mails.json';
import { getClip, onClipChange, setClip, type Clip } from './clipboard';

// ---- メールの状態（ウィンドウを閉じても残す） ----
type Mail = (typeof data.mails)[number] & {
  attachment?: { name: string; behavior: number; lines: string[] };
};
const mails = data.mails as Mail[];
export const mailUi = data.ui;

/** 届いたメールのid（新しい順） */
const arrived: string[] = [];
const read = new Set<string>();
let selected = '';
/** 添付ごとのコピー用データ（同じものを使い回して「コピー中」を判定する） */
const clips = new Map<string, Clip>();

export function findMail(id: string): Mail | undefined {
  return mails.find((m) => m.id === id);
}

/** メールを届ける。届いたメールを返す（なければ null） */
export function deliverMail(id: string): Mail | null {
  const mail = findMail(id);
  if (!mail || arrived.includes(id)) return null;
  arrived.unshift(id);
  return mail;
}

export function hasMail(): boolean {
  return arrived.length > 0;
}

export function unreadCount(): number {
  return arrived.filter((id) => !read.has(id)).length;
}

/** 次に開いたとき、このメールを表示する */
export function selectMail(id: string): void {
  selected = id;
}

export function getMailState() {
  return { arrived: [...arrived], read: [...read] };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/**
 * メールのウィンドウの中身。onRead：既読にしたとき。onCopy：添付をコピーしたとき。
 * 戻り値の cleanup はウィンドウを閉じるときに呼ぶ。
 */
export function buildMailBody(
  onRead: () => void,
  onCopy: (clip: Clip) => void,
): { body: HTMLElement; cleanup: () => void } {
  const body = el('div', 'mail-body');
  const list = el('ul', 'mail-list');
  const view = el('article', 'mail-view');
  body.append(list, view);

  if (!selected || !arrived.includes(selected)) selected = arrived[0] ?? '';

  let renderCopy = () => {};

  const renderList = () => {
    list.replaceChildren();
    for (const id of arrived) {
      const m = findMail(id)!;
      const li = el('li');
      const btn = el('button', 'mail-item');
      btn.type = 'button';
      btn.classList.toggle('is-selected', id === selected);
      btn.setAttribute('aria-current', String(id === selected));
      btn.append(el('span', 'mail-from', m.from), el('span', 'mail-time', m.receivedAt));
      if (!read.has(id)) btn.append(el('span', 'mail-unread', mailUi.unread));
      btn.append(el('span', 'mail-subject', `${m.attachment ? '📎 ' : ''}${m.subject}`));
      btn.addEventListener('click', () => {
        selected = id;
        render();
      });
      li.append(btn);
      list.append(li);
    }
  };

  const renderView = () => {
    view.replaceChildren();
    const m = findMail(selected);
    if (!m) {
      view.append(el('p', 'mail-meta', mailUi.empty));
      return;
    }
    view.append(el('h2', 'mail-view-subject', m.subject));
    view.append(
      el('p', 'mail-meta', `差出人：${m.from} <${m.fromAddress}>　宛先：${mailUi.to}　${m.receivedAt}`),
    );
    const text = el('div', 'mail-text');
    for (const line of m.body) text.append(el('p', '', line || ' '));
    view.append(text);

    const att = m.attachment;
    if (att) {
      let clip = clips.get(m.id);
      if (!clip) {
        clip = { sourceId: `mail:${m.id}`, behavior: att.behavior, lines: att.lines };
        clips.set(m.id, clip);
      }
      const box = el('section', 'mail-attachment');
      box.setAttribute('aria-label', mailUi.attachmentLabel);
      const head = el('div', 'mail-attachment-head');
      head.append(el('span', 'mail-attachment-label', mailUi.attachmentLabel), el('strong', '', att.name));
      const sheet = el('div', 'mail-attachment-sheet');
      for (const line of att.lines) sheet.append(el('p', '', line));
      const copy = el('button', 'copy-btn');
      copy.type = 'button';
      const c = clip;
      renderCopy = () => {
        const active = getClip() === c;
        copy.textContent = active ? mailUi.copied : mailUi.copy;
        copy.classList.toggle('is-active', active);
        copy.setAttribute('aria-pressed', String(active));
      };
      renderCopy();
      copy.addEventListener('click', () => {
        setClip(c);
        onCopy(c);
      });
      box.append(head, sheet, copy);
      view.append(box);
    } else {
      renderCopy = () => {};
    }

    if (!read.has(m.id)) {
      read.add(m.id);
      onRead();
    }
  };

  const render = () => {
    renderView(); // 先に既読にしてから一覧を描く
    renderList();
  };
  render();

  const off = onClipChange(() => renderCopy());
  return { body, cleanup: off };
}
