let audioCtx: AudioContext | null = null;
let unlocked = false;

function getCtx(): AudioContext {
  if (!audioCtx) {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    audioCtx = new Ctx();
  }
  return audioCtx;
}

export function unlockAudio() {
  if (unlocked) return;
  try {
    const ctx = getCtx();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
    unlocked = true;
  } catch {
    /* ignore */
  }
}

export function beep(freq = 1046, durationMs = 100) {
  try {
    const ctx = getCtx();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "square";
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.005);
    gain.gain.setValueAtTime(0.25, ctx.currentTime + durationMs / 1000 - 0.01);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + durationMs / 1000);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + durationMs / 1000 + 0.01);
  } catch {
    /* ignore */
  }
}

export function vibrate(ms = 50) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignore */
  }
}

export function errorBeep() {
  beep(280, 180);
  setTimeout(() => beep(220, 180), 210);
}
