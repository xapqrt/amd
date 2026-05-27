const TARGET = "OFFSCREEN_AUDIO";

let audio_ctx = null;
let master_gain = null;
let active_nodes = [];
let active_track = "";
let current_volume = 0.22;
let transition_lock = false;
let pending_track = null;

function bootAudio() {
  if (!audio_ctx || audio_ctx.state === "closed") {
    audio_ctx = new AudioContext();
    master_gain = audio_ctx.createGain();
    master_gain.gain.value = current_volume;
    master_gain.connect(audio_ctx.destination);
  }
  if (audio_ctx.state === "suspended") audio_ctx.resume();
}

function killCurrentTrack() {
  for (const n of active_nodes) {
    try { n.stop?.(); } catch {}
    try { n.disconnect?.(); } catch {}
  }
  active_nodes = [];
  active_track = "";
}

function softKillCurrentTrack(ms = 1500) {
  if (!audio_ctx || !master_gain) {
    killCurrentTrack();
    return;
  }
  const now = audio_ctx.currentTime;
  const cur = master_gain.gain.value;
  master_gain.gain.cancelScheduledValues(now);
  master_gain.gain.setValueAtTime(cur, now);
  master_gain.gain.linearRampToValueAtTime(0.0001, now + ms / 1000);
  setTimeout(() => {
    killCurrentTrack();
    master_gain.gain.value = current_volume;
  }, ms + 50);
}

function setVolume(v) {
  current_volume = Math.max(0, Math.min(1, Number(v || 0.22)));
  if (master_gain && audio_ctx) {
    master_gain.gain.setValueAtTime(current_volume, audio_ctx.currentTime);
  }
}

function mkOsc(type, freq, gainVal, detune = 0) {
  const o = audio_ctx.createOscillator();
  const g = audio_ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  g.gain.value = gainVal;
  o.connect(g).connect(master_gain);
  o.start();
  active_nodes.push(o, g);
  return { o, g };
}

function startThrillerTrack() {
  const bass = mkOsc("sawtooth", 41, 0.03, -7);
  const drone = mkOsc("triangle", 82, 0.02, 4);
  const pulse = mkOsc("square", 1.2, 0.015, 0);
  pulse.o.connect(pulse.g);
  active_track = "Thriller";
}









function startLibraryTrack() {
  const noise_buffer = audio_ctx.createBuffer(1, audio_ctx.sampleRate * 2, audio_ctx.sampleRate);
  const out = noise_buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < out.length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + (0.02 * white)) / 1.02;
    out[i] = last * 3.5;
  }
  const src = audio_ctx.createBufferSource();
  src.buffer = noise_buffer;
  src.loop = true;
  const lp = audio_ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 520;
  const g = audio_ctx.createGain();
  g.gain.value = 0.024;
  src.connect(lp).connect(g).connect(master_gain);
  src.start();
  active_nodes.push(src, lp, g);
  active_track = "Library";
}

function startArcadeTrack() {
  const arpA = mkOsc("square", 220, 0.02);
  const arpB = mkOsc("square", 330, 0.016, 7);
  let step = 0;
  const timer = setInterval(() => {
    if (!audio_ctx) return;
    const seq = [220, 262, 330, 392, 523, 392, 330, 262];
    const n = seq[step % seq.length];
    arpA.o.frequency.setTargetAtTime(n, audio_ctx.currentTime, 0.02);
    arpB.o.frequency.setTargetAtTime(n * 1.5, audio_ctx.currentTime, 0.02);
    step++;
  }, 260);
  active_nodes.push({ stop: () => clearInterval(timer), disconnect: () => {} });
  active_track = "Arcade";
}









function startZenTrack() {
  const synth_thing = mkOsc("sine", 174, 0.026);
  const over = mkOsc("sine", 261.63, 0.018);
  const air = mkOsc("triangle", 348.84, 0.011);
  let drift = 0;
  const timer = setInterval(() => {
    drift += 0.35;
    const wobble = Math.sin(drift) * 8;
    synth_thing.o.detune.value = wobble;
    over.o.detune.value = -wobble * 0.6;
    air.o.detune.value = wobble * 0.3;
  }, 180);
  active_nodes.push({ stop: () => clearInterval(timer), disconnect: () => {} });
  active_track = "Zen";
}

function startCyberpunkTrack() {
  const lead1 = mkOsc("sawtooth", 98, 0.02, -11);
  const lead2 = mkOsc("sawtooth", 98, 0.02, 11);
  const sub = mkOsc("square", 49, 0.015, 0);
  const hp = audio_ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 140;
  lead1.g.disconnect();
  lead2.g.disconnect();
  lead1.g.connect(hp);
  lead2.g.connect(hp);
  hp.connect(master_gain);
  active_nodes.push(hp, sub.o, sub.g);
  active_track = "Cyberpunk";
}









function startNatureTrack() {
  const noise_buffer = audio_ctx.createBuffer(1, audio_ctx.sampleRate * 2, audio_ctx.sampleRate);
  const out = noise_buffer.getChannelData(0);
  for (let i = 0; i < out.length; i++) out[i] = (Math.random() * 2 - 1) * 0.2;
  const src = audio_ctx.createBufferSource();
  src.buffer = noise_buffer;
  src.loop = true;
  const bp = audio_ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 980;
  const g = audio_ctx.createGain();
  g.gain.value = 0.018;
  src.connect(bp).connect(g).connect(master_gain);
  src.start();
  const bird = mkOsc("sine", 1320, 0.004);
  active_nodes.push(src, bp, g, bird.o, bird.g);
  active_track = "Nature";
}

function startSpaceTrack() {
  const deep = mkOsc("sine", 55, 0.02);
  const mid = mkOsc("triangle", 110, 0.015);
  const shimmer = mkOsc("sine", 440, 0.007);
  let t = 0;
  const timer = setInterval(() => {
    t += 0.08;
    deep.o.frequency.value = 50 + Math.sin(t) * 6;
    mid.o.frequency.value = 100 + Math.sin(t * 0.7) * 10;
    shimmer.o.detune.value = Math.sin(t * 1.7) * 22;
  }, 120);
  active_nodes.push({ stop: () => clearInterval(timer), disconnect: () => {} });
  active_track = "Space";
}









function startRadioTrack() {
  const carrier = mkOsc("sine", 300, 0.012);
  const hiss_buffer = audio_ctx.createBuffer(1, audio_ctx.sampleRate, audio_ctx.sampleRate);
  const ch = hiss_buffer.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * 0.1;
  const hiss = audio_ctx.createBufferSource();
  hiss.buffer = hiss_buffer;
  hiss.loop = true;
  const hp = audio_ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1800;
  const g = audio_ctx.createGain();
  g.gain.value = 0.016;
  hiss.connect(hp).connect(g).connect(master_gain);
  hiss.start();
  active_nodes.push(carrier.o, carrier.g, hiss, hp, g);
  active_track = "Radio";
}

function startDoomTrack() {
  const low = mkOsc("sawtooth", 37, 0.028);
  const mid = mkOsc("square", 74, 0.018, -5);
  const lfo = mkOsc("sine", 0.4, 0.0);
  const timer = setInterval(() => {
    const amt = (Math.sin(audio_ctx.currentTime * 0.8) + 1) * 0.5;
    low.g.gain.value = 0.02 + amt * 0.014;
    mid.g.gain.value = 0.01 + amt * 0.01;
  }, 90);
  active_nodes.push(lfo.o, lfo.g, { stop: () => clearInterval(timer), disconnect: () => {} });
  active_track = "Doom";
}









function startLofiTrack() {
  const root = mkOsc("triangle", 196, 0.018);
  const top = mkOsc("sine", 392, 0.011);
  const crackle = mkOsc("square", 12, 0.002);
  let step = 0;
  const timer = setInterval(() => {
    const seq = [196, 220, 247, 175];
    root.o.frequency.value = seq[step % seq.length];
    top.o.frequency.value = seq[step % seq.length] * 2;
    step++;
  }, 740);
  active_nodes.push(crackle.o, crackle.g, { stop: () => clearInterval(timer), disconnect: () => {} });
  active_track = "Lofi";
}

const STARTERS = {
  Thriller: startThrillerTrack,
  Library: startLibraryTrack,
  Arcade: startArcadeTrack,
  Zen: startZenTrack,
  Cyberpunk: startCyberpunkTrack,
  Nature: startNatureTrack,
  Space: startSpaceTrack,
  Radio: startRadioTrack,
  Doom: startDoomTrack,
  Lofi: startLofiTrack
};

function switchTrack(nextTrack) {
  if (!STARTERS[nextTrack]) return;
  if (active_track === nextTrack) return;

  if (transition_lock) {
    pending_track = nextTrack;
    return;
  }
  
  transition_lock = true;
  bootAudio();

  softKillCurrentTrack(1500);

  setTimeout(() => {
    STARTERS[nextTrack]();
    if (master_gain && audio_ctx) {
      const now = audio_ctx.currentTime;
      master_gain.gain.cancelScheduledValues(now);
      master_gain.gain.setValueAtTime(0.0001, now);
      master_gain.gain.linearRampToValueAtTime(current_volume, now + 1.5);
    }
    transition_lock = false;
    
    if (pending_track) {
      const p = pending_track;
      pending_track = null;
      if (p !== active_track) switchTrack(p);
    }
  }, 1600);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.target !== TARGET) return;

  if (msg.type === "AUDIO_INIT") {
    bootAudio();
    setVolume(msg.volume);
  }

  if (msg.type === "AUDIO_SET_VOLUME") {
    setVolume(msg.volume);
  }

  if (msg.type === "AUDIO_STOP") {
    softKillCurrentTrack(1000);
  }

  if (msg.type === "AUDIO_SWITCH_TRACK") {
    setVolume(msg.volume);
    switchTrack(msg.track);
  }
});
