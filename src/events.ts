import data from '../data/events.json';

// 仕事の途中で起きる出来事（電話など）を、操作の回数で起こす

export type GameEvent = (typeof data.events)[number];
export type ActionKind = 'aiMessage' | 'paste';

const counts: Record<ActionKind, number> = { aiMessage: 0, paste: 0 };
const fired = new Set<string>();

export const eventUi = data.ui;

/** 操作を1回数える。条件を満たした出来事があれば返す（1つの出来事は1回だけ） */
export function countAction(kind: ActionKind): GameEvent | null {
  counts[kind] += 1;
  for (const ev of data.events) {
    if (fired.has(ev.id)) continue;
    if (ev.trigger.action === kind && counts[kind] >= ev.trigger.count) {
      fired.add(ev.id);
      return ev;
    }
  }
  return null;
}

export function getCounts(): Record<ActionKind, number> {
  return { ...counts };
}
