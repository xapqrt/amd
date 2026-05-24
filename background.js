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
