import './style.css';
import opening from '../data/opening.json';
import { CONFIG } from './config';
import { isMuted, playChime, playRing, setMuted, unlockAudio } from './sound';
import { countAction, eventUi, getCounts, type ActionKind, type GameEvent } from './events';
import { buildAiBody } from './aiWindow';
import { buildDocBody, getFilled } from './docWindow';
import proposal from '../data/proposal.json';
import { playScene } from './novel';
import { decideEnding, showResult } from './ending';
import { browserUi, buildBrowserBody } from './browserWindow';
import {
  buildMailBody,
  deliverMail,
  getMailState,
  hasMail,
  mailUi,
  selectMail,
  unreadCount,
} from './mailWindow';

// ---- 画面の状態 ----
const state = {
  screen: 'start' as 'start' | 'novel' | 'desktop',
  /** 届いたメールと、読んだメール */
  mail: getMailState(),
  openWindow: null as null | WindowName,
  /** AIへの入力が当てはまった返答のid（順番どおり） */
  aiMatches: [] as string[],
  /** 当てはまった行動（1〜5）。エンディングの判定に使う予定 */
  behaviorsHit: [] as number[],
  /** 提案資料の見出しごとに、どの返答を貼ったか */
  doc: getFilled(),
  /** 操作の回数（出来事を起こす条件に使う） */
  counts: getCounts(),
  /** 起きた出来事（電話など）のid */
  eventsDone: [] as string[],
  /** 見た結末のid */
  endingsSeen: [] as string[],
  /** ブラウザで調べたもの（当てはまった結果のid） */
  searches: [] as string[],
};
type WindowName = 'mail' | 'ai' | 'doc' | 'browser';
/** 開いているウィンドウを閉じるときの後片付け */
let windowCleanup: (() => void) | null = null;

// デバッグ表示は開発中だけ（公開版では ?debug をつけても出さない）
const debug = import.meta.env.DEV && new URLSearchParams(location.search).has('debug');

// ---- 小さな部品づくり（文章は必ず textContent で入れる） ----
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

const app = document.getElementById('app')!;

// ---- ミュートボタン（どの画面でも同じ位置） ----
const muteBtn = el('button', 'mute-btn');
muteBtn.type = 'button';
function renderMute() {
  const m = isMuted();
  muteBtn.textContent = m ? '🔇 音：なし' : '🔊 音：あり';
  muteBtn.setAttribute('aria-pressed', String(m));
  muteBtn.setAttribute('aria-label', m ? '音を出す' : '音を消す');
}
muteBtn.addEventListener('click', () => {
  setMuted(!isMuted());
  renderMute();
});
renderMute();

// ---- 開始画面 ----
const startScreen = el('section', 'start-screen');
startScreen.setAttribute('aria-labelledby', 'game-title');
const startCard = el('div', 'start-card');
startCard.append(el('p', 'start-sub', opening.subtitle));
const title = el('h1', 'start-title', opening.title);
title.id = 'game-title';
startCard.append(title, el('p', 'start-role', opening.role));
const startBtn = el('button', 'primary-btn', opening.startButton);
startBtn.type = 'button';
startCard.append(startBtn, el('p', 'start-note', '会社・人物・データはすべて架空です。'));
startScreen.append(startCard);

// ---- デスクトップ ----
const desktop = el('section', 'desktop');
desktop.hidden = true;
desktop.setAttribute('aria-label', 'あなたのPCのデスクトップ');

const windowLayer = el('div', 'window-layer');

const taskbar = el('nav', 'taskbar');
taskbar.setAttribute('aria-label', 'アプリ');

type AppDef = { id: string; icon: string; label: string; ready: boolean };
const apps: AppDef[] = [
  { id: 'mail', icon: '✉️', label: 'メール', ready: true },
  { id: 'chat', icon: '💬', label: 'チャット', ready: false },
  { id: 'browser', icon: '🌐', label: 'ブラウザ', ready: true },
  { id: 'files', icon: '📁', label: 'ファイル', ready: true },
  { id: 'ai', icon: '🤖', label: 'AIアシスタント', ready: true },
];

const mailBadge = el('span', 'badge');
mailBadge.hidden = true;

const appButtons = el('div', 'app-buttons');
for (const a of apps) {
  const b = el('button', 'app-btn');
  b.type = 'button';
  b.dataset.app = a.id;
  b.append(el('span', 'app-icon', a.icon), el('span', 'app-label', a.label));
  if (a.id === 'mail') b.append(mailBadge);
  if (!a.ready) {
    b.setAttribute('aria-disabled', 'true');
    b.classList.add('not-ready');
    b.append(el('span', 'app-soon', '準備中'));
  }
  b.addEventListener('click', () => {
    if (a.id === 'mail') openMail();
    else if (a.id === 'ai') openAi();
    else if (a.id === 'files') openDoc();
    else if (a.id === 'browser') openBrowser();
    else showToast(`${a.label}：${opening.comingSoon}`, null);
  });
  appButtons.append(b);
}

const clock = el('div', 'clock', opening.clock);
clock.setAttribute('aria-label', `ゲーム内の時刻 ${opening.clock}`);
taskbar.append(appButtons, clock);

const toast = el('button', 'toast');
toast.type = 'button';
toast.hidden = true;

desktop.append(el('p', 'wallpaper-name', opening.company), windowLayer, toast, taskbar);

// ---- ウィンドウの枠（どのアプリでも同じ見た目・同じ「閉じる」） ----
function buildWindowFrame(title: string, label: string, body: HTMLElement): HTMLElement {
  const win = el('div', 'window');
  win.setAttribute('role', 'dialog');
  win.setAttribute('aria-label', label);

  const bar = el('div', 'window-bar');
  bar.append(el('span', 'window-title', title));
  const close = el('button', 'close-btn', '× 閉じる');
  close.type = 'button';
  close.addEventListener('click', closeWindow);
  bar.append(close);

  win.append(bar, body);
  return win;
}

function showWindow(name: WindowName, win: HTMLElement, cleanup: (() => void) | null = null) {
  hideToast();
  windowCleanup?.();
  windowCleanup = cleanup;
  windowLayer.replaceChildren(win);
  state.openWindow = name;
  desktop.classList.add('has-window');
  appButtons.querySelectorAll<HTMLButtonElement>('.app-btn').forEach((b) => {
    b.classList.toggle('is-open', b.dataset.app === name);
  });
  renderDebug();
}

// ---- AIアシスタントのウィンドウ ----
function openAi() {
  const { body, focus } = buildAiBody((match) => {
    state.aiMatches.push(match.id);
    if (match.behavior > 0 && !state.behaviorsHit.includes(match.behavior)) {
      state.behaviorsHit.push(match.behavior);
    }
    renderDebug();
    onAction('aiMessage');
  }, () => showToast(proposal.copied, null), (message) => showToast(message, null));
  showWindow('ai', buildWindowFrame('🤖 AIアシスタント', 'AIアシスタント', body));
  focus();
}

// ---- 提案資料（ファイル）のウィンドウ ----
function openDoc() {
  const { body, cleanup } = buildDocBody(
    (kind) => {
      state.doc = getFilled();
      renderDebug();
      if (kind === 'paste') onAction('paste');
    },
    (message) => showToast(message, null),
    submitDoc,
  );
  showWindow('doc', buildWindowFrame(`📁 ${proposal.fileName}`, proposal.fileName, body), cleanup);
}

// ---- ブラウザ（調べて確かめる） ----
function openBrowser() {
  const { body, cleanup, focus } = buildBrowserBody(
    (ruleId) => {
      state.searches.push(ruleId);
      renderDebug();
    },
    () => showToast(browserUi.copiedToast, null),
    (message) => showToast(message, null),
  );
  showWindow('browser', buildWindowFrame(`🌐 ${browserUi.name}`, browserUi.name, body), cleanup);
  focus();
}

// ---- 提出 → 結末 ----
function submitDoc() {
  const docBehaviors = Object.values(getFilled())
    .filter((v) => !!v)
    .map((v) => v!.behavior);
  const ending = decideEnding(state.behaviorsHit, docBehaviors);
  closeWindow();
  hideToast();
  callCard.hidden = true;
  state.screen = 'novel';
  renderDebug();
  playScene(ending.scene, () => {
    if (!state.endingsSeen.includes(ending.id)) state.endingsSeen.push(ending.id);
    renderDebug();
    showResult(
      ending,
      () => {
        // 提出の前に戻る：資料の画面を開き直して、別の選択を試せる
        state.screen = 'desktop';
        renderDebug();
        openDoc();
      },
      () => location.reload(),
    );
  });
}

// ---- メールウィンドウ ----
function renderBadge() {
  const n = unreadCount();
  mailBadge.hidden = n === 0;
  mailBadge.textContent = String(n);
  mailBadge.setAttribute('aria-label', `未読${n}件`);
  state.mail = getMailState();
  renderDebug();
}

function openMail(mailId?: string) {
  if (!hasMail()) {
    showToast(mailUi.empty, null);
    return;
  }
  if (mailId) selectMail(mailId);
  const { body, cleanup } = buildMailBody(renderBadge, () => showToast(mailUi.copiedToast, null));
  showWindow('mail', buildWindowFrame('✉️ メール', 'メール', body), cleanup);
  (windowLayer.querySelector('.close-btn') as HTMLButtonElement | null)?.focus();
}

function closeWindow() {
  windowCleanup?.();
  windowCleanup = null;
  windowLayer.replaceChildren();
  state.openWindow = null;
  desktop.classList.remove('has-window');
  appButtons.querySelectorAll('.app-btn').forEach((b) => b.classList.remove('is-open'));
  renderDebug();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.openWindow) closeWindow();
});

// ---- 通知 ----
let toastTimer = 0;
function showToast(message: string, onClick: (() => void) | null) {
  toast.replaceChildren(el('span', 'toast-text', message));
  toast.hidden = false;
  toast.classList.toggle('is-clickable', !!onClick);
  toast.onclick = () => {
    if (onClick) onClick();
    else hideToast();
  };
  window.clearTimeout(toastTimer);
  // 押せるお知らせ（新着メールなど）は長めに出す。消えてもタスクバーの未読の数字は残る
  toastTimer = window.setTimeout(hideToast, onClick ? CONFIG.clickableToastMs : CONFIG.toastMs);
}
function hideToast() {
  toast.hidden = true;
}

/** メールを届け、お知らせを出す（押すとそのメールが開く） */
function arriveMail(mailId: string) {
  const mail = deliverMail(mailId);
  if (!mail) return;
  renderBadge();
  playChime();
  // 開いているメール画面があれば、一覧に新しいメールを出す（お知らせより先に）
  if (state.openWindow === 'mail') openMail();
  const t = el('span', 'toast-text');
  showToast('', () => openMail(mail.id));
  t.append(
    el('strong', '', `✉️ 新着メール：${mail.from}`),
    el('span', 'toast-sub', `「${mail.subject}」 — 押して開く`),
  );
  toast.replaceChildren(t);
}

// ---- 仕事の途中の出来事（電話など） ----
const callCard = el('div', 'call-card');
callCard.hidden = true;
callCard.setAttribute('role', 'alert');
desktop.append(callCard);

/** 操作を数え、条件を満たした出来事があれば起こす */
function onAction(kind: ActionKind) {
  const ev = countAction(kind);
  state.counts = getCounts();
  renderDebug();
  // お知らせ（貼り付けました等）を読む間をおいてから鳴らす
  if (ev) window.setTimeout(() => startEvent(ev), 1200);
}

function startEvent(ev: GameEvent) {
  if (ev.type !== 'call') return;
  hideToast();
  callCard.replaceChildren();
  const info = el('div', 'call-info');
  info.append(el('span', 'call-label', eventUi.incoming), el('strong', 'call-name', ev.caller));
  const answer = el('button', 'call-answer', eventUi.answer);
  answer.type = 'button';
  answer.addEventListener('click', () => {
    callCard.hidden = true;
    state.screen = 'novel';
    renderDebug();
    playScene(ev.scene, () => {
      state.screen = 'desktop';
      state.eventsDone.push(ev.id);
      renderDebug();
      // 電話のあとに届くメール（例：田中さんの売上表）
      if (ev.thenMail) window.setTimeout(() => arriveMail(ev.thenMail), CONFIG.mailArrivalDelayMs);
    });
  });
  callCard.append(info, answer);
  callCard.hidden = false;
  playRing();
  answer.focus();
}

// ---- 開始 ----
startBtn.addEventListener('click', () => {
  unlockAudio();
  startScreen.hidden = true;
  // まず課長との会話（ノベル場面）、読み終えたらPC画面へ
  state.screen = 'novel';
  renderDebug();
  playScene('opening', () => {
    state.screen = 'desktop';
    desktop.hidden = false;
    window.setTimeout(() => arriveMail(opening.firstMail), CONFIG.mailArrivalDelayMs);
    renderDebug();
  });
});

// ---- デバッグ表示（URLの最後に ?debug をつけたときだけ） ----
const debugPanel = el('pre', 'debug-panel');
function renderDebug() {
  if (!debug) return;
  debugPanel.textContent = JSON.stringify(state, null, 1);
}

app.append(startScreen, desktop, muteBtn);
if (debug) {
  app.append(debugPanel);
  renderDebug();
}
startBtn.focus();
