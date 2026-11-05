import doc from '../data/proposal.json';
import endings from '../data/endings.json';
import { getClip, onClipChange, type Clip } from './clipboard';

// ---- 資料の中身（ウィンドウを閉じても残す） ----
/** 見出しのid → 貼られた中身 */
const filled: Record<string, Clip | undefined> = {};

export function getFilled(): Record<string, { sourceId: string; behavior: number } | undefined> {
  const out: Record<string, { sourceId: string; behavior: number } | undefined> = {};
  for (const s of doc.sections) {
    const c = filled[s.id];
    out[s.id] = c ? { sourceId: c.sourceId, behavior: c.behavior } : undefined;
  }
  return out;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function preview(lines: string[]): string {
  const first = lines.find((l) => l.trim()) ?? '';
  return first.length > 28 ? `${first.slice(0, 28)}…` : first;
}

/**
 * 提案資料のウィンドウの中身をつくる。
 * onChange：貼る・空にするたびに呼ぶ。notify：短いお知らせを出す。
 * 戻り値の cleanup はウィンドウを閉じるときに呼ぶ。
 */
export function buildDocBody(
  onChange: (kind: 'paste' | 'clear') => void,
  notify: (message: string) => void,
  onSubmit: () => void,
): { body: HTMLElement; cleanup: () => void } {
  const body = el('div', 'doc-body');

  // いまコピーしているもの
  const clipBar = el('div', 'clip-bar');
  clipBar.setAttribute('aria-live', 'polite');
  const renderClip = () => {
    const c = getClip();
    clipBar.replaceChildren();
    if (c) {
      clipBar.classList.add('has-clip');
      clipBar.append(el('strong', '', '📋 コピー中：'), el('span', '', `「${preview(c.lines)}」`));
    } else {
      clipBar.classList.remove('has-clip');
      clipBar.append(el('span', '', doc.noClipboard));
    }
    body.querySelectorAll<HTMLButtonElement>('.paste-btn').forEach((b) => {
      b.classList.toggle('is-ready', !!c);
    });
  };

  const page = el('div', 'doc-page');
  page.append(el('h2', 'doc-title', doc.fileName), el('p', 'doc-intro', doc.intro));

  for (const s of doc.sections) {
    const sec = el('section', 'doc-section');
    sec.setAttribute('aria-label', s.heading);
    const head = el('div', 'doc-section-head');
    head.append(el('h3', 'doc-heading', s.heading));

    const actions = el('div', 'doc-actions');
    const paste = el('button', 'paste-btn', doc.pasteButton);
    paste.type = 'button';
    const clear = el('button', 'clear-btn', doc.clearButton);
    clear.type = 'button';
    actions.append(paste, clear);
    head.append(actions);

    const content = el('div', 'doc-content');
    const renderSection = () => {
      const c = filled[s.id];
      content.replaceChildren();
      if (c) {
        for (const line of c.lines) content.append(el('p', '', line || ' '));
        content.classList.remove('is-empty');
        clear.hidden = false;
      } else {
        content.append(el('p', '', doc.emptyText));
        content.classList.add('is-empty');
        clear.hidden = true;
      }
    };
    renderSection();

    paste.addEventListener('click', () => {
      const c = getClip();
      if (!c) {
        notify(doc.noClipboard);
        return;
      }
      filled[s.id] = c;
      renderSection();
      // 置けた手応え：一瞬だけ枠を光らせる（1回だけ）
      sec.classList.remove('just-pasted');
      void sec.offsetWidth;
      sec.classList.add('just-pasted');
      notify(`${s.heading} に${doc.pasted}`);
      onChange('paste');
    });
    clear.addEventListener('click', () => {
      filled[s.id] = undefined;
      renderSection();
      onChange('clear');
      paste.focus();
    });

    sec.append(head, content);
    page.append(sec);
  }

  // ---- 提出（押すと確認を出し、「提出する」で結末へ） ----
  const ui = endings.ui;
  const submitArea = el('div', 'doc-submit');
  const submit = el('button', 'primary-btn doc-submit-btn', ui.submit);
  submit.type = 'button';
  const confirmBox = el('div', 'doc-confirm');
  confirmBox.hidden = true;
  confirmBox.setAttribute('role', 'alertdialog');
  confirmBox.setAttribute('aria-label', ui.confirm);
  const yes = el('button', 'primary-btn', ui.confirmYes);
  yes.type = 'button';
  const no = el('button', 'clear-btn', ui.confirmNo);
  no.type = 'button';
  const confirmActions = el('div', 'doc-confirm-actions');
  confirmActions.append(no, yes);
  confirmBox.append(el('p', '', ui.confirm), confirmActions);
  submitArea.append(submit, confirmBox);
  page.append(submitArea);

  submit.addEventListener('click', () => {
    if (!doc.sections.some((s) => filled[s.id])) {
      notify(ui.emptyDoc);
      return;
    }
    submit.hidden = true;
    confirmBox.hidden = false;
    yes.focus();
    confirmBox.scrollIntoView({ block: 'nearest' });
  });
  no.addEventListener('click', () => {
    confirmBox.hidden = true;
    submit.hidden = false;
    submit.focus();
  });
  yes.addEventListener('click', onSubmit);

  body.append(clipBar, page);
  renderClip();
  const off = onClipChange(renderClip);
  return { body, cleanup: off };
}
