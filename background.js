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

function bootAudio() {
  if (!audio_ctx || audio_ctx.state === "closed") {
    audio_ctx = new AudioContext();
    master_gain = audio_ctx.createGain();
    master_gain.gain.value = 0.22;
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

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === "MOOD_DETECTED") {
    const url = sender?.tab?.url || "";
    const domain = safeDomain(url);
    const mood = msg.mood && TRACKS.includes(msg.mood)
      ? msg.mood : pickMoodFromKeywords(msg.rawText);
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
  const data = await chrome.storage.local.get(["domainTrackMap", "muteList"]);
  domain_track_map = data.domainTrackMap || {};
  mute_list = data.muteList || [];
}

async function saveVault() {
  await chrome.storage.local.set({
    domainTrackMap: domain_track_map,
    muteList: mute_list
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
