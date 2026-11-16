// audio.js — every sound is synthesised with WebAudio. No audio files are
// shipped, so the game loads nothing over the network.
export function createAudio() {
  let ctx = null;
  let master = null;
  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  }
  function noiseBuffer(dur) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    return buf;
  }
  function burst(dur, freq, type, vol, slideTo) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur);
    const f = ctx.createBiquadFilter();
    f.type = type || 'lowpass';
    f.frequency.setValueAtTime(freq, t);
    if (slideTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.02);
  }
  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  return {
    unlock() { ensure(); },
    shot(kind) {
      if (kind === 'sniper') { burst(0.28, 2400, 'lowpass', 0.9, 120); tone(160, 0.14, 'square', 0.25, 50); }
      else if (kind === 'smg') burst(0.09, 1800, 'bandpass', 0.55, 500);
      else if (kind === 'pistol') burst(0.12, 1500, 'lowpass', 0.7, 200);
      else burst(0.14, 1200, 'lowpass', 0.8, 150);
    },
    distantShot() { burst(0.12, 700, 'lowpass', 0.25, 120); },
    hit() { tone(1200, 0.05, 'square', 0.18); },
    kill() { tone(880, 0.07, 'square', 0.2); tone(1320, 0.09, 'square', 0.18); },
    hurt() { tone(220, 0.12, 'sawtooth', 0.2, 90); },
    reload() { tone(500, 0.05, 'square', 0.15); setTimeout(() => tone(700, 0.05, 'square', 0.15), 180); },
    dry() { tone(900, 0.04, 'square', 0.12); },
    plantBeep() { tone(1100, 0.08, 'sine', 0.25); },
    defuseBeep() { tone(700, 0.08, 'sine', 0.25); },
    explosion() { burst(0.7, 900, 'lowpass', 1.0, 60); tone(60, 0.6, 'sine', 0.6, 30); },
    grenadePin() { tone(1500, 0.03, 'square', 0.12); },
    roundWin() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.3), i * 130)); },
    roundLose() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'triangle', 0.28), i * 150)); },
    buy() { tone(980, 0.06, 'sine', 0.2); setTimeout(() => tone(1240, 0.08, 'sine', 0.2), 70); },
    denied() { tone(180, 0.12, 'square', 0.2, 120); },
  };
}
