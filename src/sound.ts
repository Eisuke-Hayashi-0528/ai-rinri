import { CONFIG } from './config';

// 音のファイルを使わず、ブラウザの機能で短い通知音をつくる
let ctx: AudioContext | null = null;
let muted = loadMuted();

function loadMuted(): boolean {
  try {
    return localStorage.getItem('ai-rinri-muted') === '1';
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem('ai-rinri-muted', value ? '1' : '0');
  } catch {
    // 保存できない環境でも遊べるようにする
  }
}

/** スマホではタップの瞬間にしか音を有効にできないので、開始ボタンで呼ぶ */
export function unlockAudio(): void {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

/** メール着信の「ポロン」という2音 */
export function playChime(): void {
  if (muted || !ctx) return;
  const now = ctx.currentTime;
  [880, 1320].forEach((freq, i) => {
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const start = now + i * 0.12;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(CONFIG.soundVolume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
    osc.connect(gain).connect(ctx!.destination);
    osc.start(start);
    osc.stop(start + 0.4);
  });
}

/** 電話の呼び出し音。「トゥルル」を2回だけ鳴らして止まる（3秒を超えて鳴り続けない） */
export function playRing(): void {
  if (muted || !ctx) return;
  const now = ctx.currentTime;
  for (let ring = 0; ring < 2; ring++) {
    for (let pulse = 0; pulse < 6; pulse++) {
      const start = now + ring * 1.1 + pulse * 0.07;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = pulse % 2 === 0 ? 660 : 820;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(CONFIG.soundVolume * 0.8, start + 0.01);
      gain.gain.linearRampToValueAtTime(0, start + 0.065);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.07);
    }
  }
}

// アプリを裏に回したら音を止める
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) void ctx.suspend();
  else void ctx.resume();
});
