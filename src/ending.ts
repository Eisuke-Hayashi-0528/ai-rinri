import data from '../data/endings.json';

// ---- 結末の決め方 ----
type Condition = { aiBehavior?: number; docBehavior?: number };
export type Ending = {
  id: string;
  behavior: number;
  title: string;
  condition: Condition;
  scene: string;
  where: string;
  why: string;
};
type Card = { title: string; action: string; reason: string; realCase: string; source: string };

const endings = data.endings as Ending[];
const cards = data.cards as Record<string, Card>;
const ui = data.ui;

/**
 * 上から順に条件を調べ、最初に当てはまった結末を返す。
 * behaviorsHit：AIへの入力が当てはまった行動。docBehaviors：提案資料に貼った中身の行動。
 */
export function decideEnding(behaviorsHit: number[], docBehaviors: number[]): Ending {
  for (const e of endings) {
    const c = e.condition;
    if (c.aiBehavior !== undefined && !behaviorsHit.includes(c.aiBehavior)) continue;
    if (c.docBehavior !== undefined && !docBehaviors.includes(c.docBehavior)) continue;
    return e;
  }
  return endings[endings.length - 1];
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** 結末のふり返り画面（どこで・なぜ・持ち帰る行動のカード） */
export function showResult(ending: Ending, onBack: () => void, onRestart: () => void): void {
  const root = el('section', 'ending');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-labelledby', 'ending-title');

  const panel = el('div', 'ending-panel');
  panel.append(el('p', 'ending-label', `${ui.endingLabel} ${ending.id}`));
  const title = el('h2', 'ending-title', ending.title);
  title.id = 'ending-title';
  panel.append(title);

  const dl = el('dl', 'ending-reflect');
  dl.append(el('dt', '', ui.where), el('dd', '', ending.where), el('dt', '', ui.why), el('dd', '', ending.why));
  panel.append(dl);

  const card = cards[String(ending.behavior)];
  if (card) {
    const c = el('article', 'ending-card');
    c.setAttribute('aria-label', ui.cardLabel);
    c.append(el('p', 'ending-card-label', `🃏 ${ui.cardLabel}`), el('h3', 'ending-card-title', card.title));
    c.append(el('p', 'ending-card-action', card.action));
    const more = el('dl', 'ending-card-more');
    more.append(
      el('dt', '', ui.reason),
      el('dd', '', card.reason),
      el('dt', '', ui.realCase),
      el('dd', '', card.realCase),
      el('dt', '', ui.source),
      el('dd', 'ending-source', card.source),
    );
    c.append(more);
    panel.append(c);
  }

  const actions = el('div', 'ending-actions');
  const back = el('button', 'clear-btn', ui.backToSubmit);
  back.type = 'button';
  const restart = el('button', 'primary-btn', ui.restart);
  restart.type = 'button';
  actions.append(back, restart);
  panel.append(actions);

  root.append(panel);
  document.getElementById('app')!.append(root);

  back.addEventListener('click', () => {
    root.remove();
    onBack();
  });
  restart.addEventListener('click', () => {
    root.remove();
    onRestart();
  });
  restart.focus();
}
