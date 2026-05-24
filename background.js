const TRACKS = [
  "Thriller", "Library", "Arcade", "Zen", "Cyberpunk",
  "Nature", "Space", "Radio", "Doom", "Lofi"
];

let audio_ctx = null;
let master_gain = null;
let active_nodes = [];
let active_track = null;
let active_domain_string = "";
let mute_list = [];
let domain_track_map = {};
let transition_lock = false;
let master_volume = 0.22;

function bootAudio() {
  if (!audio_ctx || audio_ctx.state === "closed") {
    audio_ctx = new AudioContext();
    master_gain = audio_ctx.createGain();
    master_gain.gain.value = master_volume;
    master_gain.connect(audio_ctx.destination);
    console.log("AUDIO CONTEXT DIED REBOOTING");
  }
  if (audio_ctx.state === "suspended") audio_ctx.resume();
}

function killCurrentTrack() {
  for (const n of active_nodes) {
    try { n.stop?.(); } catch {}
    try { n.disconnect?.(); } catch {}
  }
  active_nodes = [];
  active_track = null;
}

function softKillCurrentTrack(ms = 140) {
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
    master_gain.gain.value = master_volume;
  }, ms + 20);
}

const MOOD_KEYWORDS = {
  Thriller: ["war", "crisis", "breaking", "attack", "threat", "panic"],
  Library: ["study", "history", "wiki", "archive", "literature"],
  Arcade: ["game", "arcade", "score", "combo", "pixel", "retro"],
  Zen: ["meditation", "calm", "mindful", "yoga", "breath"],
  Cyberpunk: ["github", "code", "tech", "terminal", "hacker", "ai"],
  Nature: ["forest", "river", "wildlife", "mountain", "eco"],
  Space: ["space", "galaxy", "orbit", "nasa", "cosmos", "planet"],
  Radio: ["podcast", "broadcast", "newsroom", "station", "fm"],
  Doom: ["horror", "doom", "dark", "demon", "apocalypse"],
  Lofi: ["chill", "lofi", "focus", "beats", "vibes", "late night"]
};

const DOMAIN_MOOD_HINTS = {
  "wikipedia.org": "Library",
  "github.com": "Cyberpunk",
  "gitlab.com": "Cyberpunk",
  "x.com": "Arcade",
  "twitter.com": "Arcade",
  "instagram.com": "Arcade",
  "tiktok.com": "Arcade",
  "bbc.com": "Thriller",
  "cnn.com": "Thriller",
  "nytimes.com": "Thriller",
  "nature.com": "Nature",
  "nasa.gov": "Space"
};

function pickMoodFromKeywords(rawText) {
  const text = (rawText || "").toLowerCase();
  let winner = "Lofi";
  let best = 0;
  for (const [mood, words] of Object.entries(MOOD_KEYWORDS)) {
    let score = 0;
    for (const w of words) if (text.includes(w)) score += 1;
    if (score > best) {
      best = score;
      winner = mood;
    }
  }
  return winner;
}

function pickMoodFromDomain(domain) {
  if (!domain) return "";
  const hit = Object.entries(DOMAIN_MOOD_HINTS)
    .find(([needle]) => domain.endsWith(needle));
  return hit ? hit[1] : "";
}

function chooseMood(domain, rawText, signals = {}) {
  const contentMood = pickMoodFromKeywords(rawText);
  const domainMood = pickMoodFromDomain(domain);
  if (signals.hasCode && domainMood !== "Thriller") return "Cyberpunk";
  if ((signals.articleCount || 0) > 2 && (signals.linkCount || 0) > 80) return "Library";
  if (signals.hasVideo && (signals.linkCount || 0) > 100) return "Arcade";
  if (!domainMood) return contentMood;
  if (domainMood === contentMood) return contentMood;

  const txt = (rawText || "").toLowerCase();
  const words = MOOD_KEYWORDS[contentMood] || [];
  let confidence = 0;
  for (const w of words) if (txt.includes(w)) confidence += 1;
  return confidence >= 3 ? contentMood : domainMood;
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === "MOOD_DETECTED") {
    const url = sender?.tab?.url || "";
    const domain = safeDomain(url);
    const hintMood = msg.mood && TRACKS.includes(msg.mood) ? msg.mood : "";
    const mood = chooseMood(domain, `${msg.rawText || ""} ${hintMood}`, msg.signals || {});
    routeDomainMood(domain, mood);
  }
});

function safeDomain(urlString) {
  try {
    return new URL(urlString).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function loadVault() {
  const data = await chrome.storage.local.get(["domainTrackMap", "muteList", "masterVolume"]);
  domain_track_map = data.domainTrackMap || {};
  mute_list = data.muteList || [];
  master_volume = typeof data.masterVolume === "number" ? data.masterVolume : 0.22;
}

async function saveVault() {
  await chrome.storage.local.set({
    domainTrackMap: domain_track_map,
    muteList: mute_list,
    masterVolume: master_volume
  });
}

function routeDomainMood(domain, detectedMood) {
  active_domain_string = domain || active_domain_string;
  if (!active_domain_string) return;
  if (mute_list.includes(active_domain_string)) {
    killCurrentTrack();
    return;
  }
  const forced = domain_track_map[active_domain_string];
  const finalMood = forced && TRACKS.includes(forced) ? forced : detectedMood;
  switchTrack(finalMood);
}

async function initEngine() {
  await loadVault();
  bootAudio();
}

initEngine();

async function recheckActiveTabMood() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs?.[0];
  if (!tab?.url) return;
  const domain = safeDomain(tab.url);
  const guessText = `${tab.title || ""} ${domain}`;
  const guessedMood = chooseMood(domain, guessText);
  routeDomainMood(domain, guessedMood);
}

chrome.tabs.onActivated.addListener(() => {
  recheckActiveTabMood().catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status !== "complete") return;
  if (!tab?.active) return;
  recheckActiveTabMood().catch(() => {});
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-domain-mute") return;
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs?.[0];
  if (!tab?.url) return;
  const domain = safeDomain(tab.url);
  if (!domain) return;
  if (mute_list.includes(domain)) {
    mute_list = mute_list.filter((d) => d !== domain);
    console.log("unmuted domain from shortcut", domain);
  } else {
    mute_list.push(domain);
    console.log("muted domain from shortcut", domain);
  }
  await saveVault();
  recheckActiveTabMood().catch(() => {});
});

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
  // careful with the gain node here or you will blow out your speakers
  const bass = mkOsc("sawtooth", 41, 0.03, -7);
  const drone = mkOsc("triangle", 82, 0.02, 4);
  const pulse = mkOsc("square", 1.2, 0.015, 0);
  pulse.o.connect(pulse.g);
  active_track = "Thriller";
}









function startLibraryTrack() {
  // web audio api docs are literally unreadable
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
  console.log("matched cyberpunk mood... injecting synth");
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
  // TODO: make the 'nature' track sound less like tv static
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
  if (!TRACKS.includes(nextTrack)) return;
  if (transition_lock) return;
  transition_lock = true;
  bootAudio();
  if (active_track === nextTrack) {
    transition_lock = false;
    return;
  }
  softKillCurrentTrack(120);
  const fn = STARTERS[nextTrack];
  setTimeout(() => {
    if (fn) fn();
    if (master_gain && audio_ctx) {
      const now = audio_ctx.currentTime;
      master_gain.gain.setValueAtTime(0.0001, now);
      master_gain.gain.linearRampToValueAtTime(master_volume, now + 0.18);
    }
    transition_lock = false;
  }, 130);
}

chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg?.type === "POPUP_SET_TRACK") {
    domain_track_map[msg.domain] = msg.track;
    await saveVault();
    routeDomainMood(msg.domain, msg.track);
  }
  if (msg?.type === "POPUP_CLEAR_TRACK") {
    delete domain_track_map[msg.domain];
    await saveVault();
    recheckActiveTabMood().catch(() => {});
  }
  if (msg?.type === "POPUP_SET_MUTE") {
    const domain = msg.domain;
    if (msg.muted && !mute_list.includes(domain)) mute_list.push(domain);
    if (!msg.muted) mute_list = mute_list.filter((d) => d !== domain);
    await saveVault();
    routeDomainMood(domain, active_track || "Lofi");
  }
  if (msg?.type === "POPUP_QUERY_STATE") {
    const domain = msg.domain;
    return Promise.resolve({
      domain,
      forcedTrack: domain_track_map[domain] || "",
      muted: mute_list.includes(domain),
      tracks: TRACKS,
      volume: master_volume
    });
  }
  if (msg?.type === "POPUP_SET_VOLUME") {
    master_volume = Math.max(0, Math.min(1, Number(msg.volume || 0.22)));
    if (master_gain) master_gain.gain.value = master_volume;
    await saveVault();
  }
  if (msg?.type === "OPTIONS_GET_ALL") {
    const keys = new Set([...Object.keys(domain_track_map), ...mute_list]);
    const rows = [...keys].sort().map((domain) => ({
      domain,
      track: domain_track_map[domain] || "",
      muted: mute_list.includes(domain)
    }));
    return Promise.resolve({ rows });
  }
  if (msg?.type === "OPTIONS_SAVE_DOMAIN") {
    const domain = (msg.domain || "").toLowerCase();
    if (!domain) return;
    if (msg.track) domain_track_map[domain] = msg.track;
    if (!msg.track) delete domain_track_map[domain];
    if (msg.muted && !mute_list.includes(domain)) mute_list.push(domain);
    if (!msg.muted) mute_list = mute_list.filter((d) => d !== domain);
    await saveVault();
    if (domain === active_domain_string) routeDomainMood(domain, active_track || "Lofi");
  }
  if (msg?.type === "OPTIONS_REMOVE_DOMAIN") {
    const domain = (msg.domain || "").toLowerCase();
    delete domain_track_map[domain];
    mute_list = mute_list.filter((d) => d !== domain);
    await saveVault();
    if (domain === active_domain_string) recheckActiveTabMood().catch(() => {});
  }
});
