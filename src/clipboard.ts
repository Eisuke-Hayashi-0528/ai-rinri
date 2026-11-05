// ゲーム内の「コピー中の文章」（本物のクリップボードは使わない）

export type Clip = {
  /** どの返答から来たか（data/ai-assistant.json の id） */
  sourceId: string;
  /** 紐づく行動（1〜5、0は紐づけなし） */
  behavior: number;
  lines: string[];
};

let current: Clip | null = null;
const listeners = new Set<() => void>();

export function getClip(): Clip | null {
  return current;
}

export function setClip(clip: Clip): void {
  current = clip;
  listeners.forEach((fn) => fn());
}

/** コピーの中身が変わったら呼ばれる。戻り値の関数で登録を外す */
export function onClipChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
