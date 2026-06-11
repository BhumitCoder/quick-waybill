let audioCtx: AudioContext | null = null;

export function beep(freq = 880, durationMs = 80) {
  try {
    if (!audioCtx) {
      const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      audioCtx = new Ctx();
    }
    const ctx = audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
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
  beep(220, 160);
}
