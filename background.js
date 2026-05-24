const TRACKS = [
  "Thriller", "Library", "Arcade", "Zen", "Cyberpunk",
  "Nature", "Space", "Radio", "Doom", "Lofi"
];

const OFFSCREEN_AUDIO_TARGET = "OFFSCREEN_AUDIO";
const OFFSCREEN_PAGE = "offscreen.html";

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

let active_track = "";
let active_domain_string = "";
let mute_list = [];
let domain_track_map = {};
let master_volume = 0.22;
let global_muted = false;

function safeDomain(urlString) {
  try {
    return new URL(urlString).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function normalizeDomainLoose(input) {
  const raw = String(input || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw.includes("/")) {
    return safeDomain(raw.startsWith("http") ? raw : `https://${raw}`);
  }
  return raw.replace(/^www\./, "");
}

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
  const hit = Object.entries(DOMAIN_MOOD_HINTS).find(([needle]) => domain.endsWith(needle));
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

async function loadVault() {
  const data = await chrome.storage.local.get(["domainTrackMap", "muteList", "masterVolume", "globalMuted"]);
  domain_track_map = data.domainTrackMap || {};
  mute_list = data.muteList || [];
  master_volume = typeof data.masterVolume === "number" ? data.masterVolume : 0.22;
  global_muted = !!data.globalMuted;
}

async function saveVault() {
  await chrome.storage.local.set({
    domainTrackMap: domain_track_map,
    muteList: mute_list,
    masterVolume: master_volume,
    globalMuted: global_muted
  });
}

async function ensureOffscreenDocument() {
  if (!chrome.offscreen) return;
  let hasDocument = false;
  if (chrome.offscreen.hasDocument) {
    hasDocument = await chrome.offscreen.hasDocument();
  }

  if (!hasDocument) {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_PAGE,
      reasons: ["AUDIO_PLAYBACK"],
      justification: "Generate procedural ambient soundtracks"
    });
  }

  await chrome.runtime.sendMessage({
    target: OFFSCREEN_AUDIO_TARGET,
    type: "AUDIO_INIT",
    volume: master_volume
  });
}

async function sendAudio(msg) {
  await ensureOffscreenDocument();
  await chrome.runtime.sendMessage({ target: OFFSCREEN_AUDIO_TARGET, ...msg });
}

async function switchTrack(nextTrack) {
  if (!TRACKS.includes(nextTrack)) return;
  if (active_track === nextTrack) return;
  active_track = nextTrack;
  await sendAudio({ type: "AUDIO_SWITCH_TRACK", track: nextTrack, volume: master_volume });
}

async function routeDomainMood(domain, detectedMood) {
  if (global_muted) {
    active_track = "";
    await sendAudio({ type: "AUDIO_STOP" });
    return;
  }

  active_domain_string = domain || active_domain_string;
  if (!active_domain_string) return;

  if (mute_list.includes(active_domain_string)) {
    active_track = "";
    await sendAudio({ type: "AUDIO_STOP" });
    return;
  }

  const forced = domain_track_map[active_domain_string];
  const finalMood = forced && TRACKS.includes(forced) ? forced : detectedMood;
  await switchTrack(finalMood);
}

async function recheckActiveTabMood() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs?.[0];
  if (!tab?.url) return;
  const domain = safeDomain(tab.url);
  const guessText = `${tab.title || ""} ${domain}`;
  const guessedMood = chooseMood(domain, guessText);
  await routeDomainMood(domain, guessedMood);
}

async function initEngine() {
  await loadVault();
  await ensureOffscreenDocument();
  chrome.alarms.create("ws-health", { periodInMinutes: 1 });
}

chrome.tabs.onActivated.addListener(() => {
  recheckActiveTabMood().catch(() => {});
});

chrome.tabs.onUpdated.addListener((_, info, tab) => {
  if (info.status !== "complete") return;
  if (!tab?.active) return;
  recheckActiveTabMood().catch(() => {});
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== "ws-health") return;
  ensureOffscreenDocument().catch(() => {});
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-domain-mute") return;
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs?.[0];
  const domain = safeDomain(tab?.url || "");
  if (!domain) return;

  if (mute_list.includes(domain)) {
    mute_list = mute_list.filter((d) => d !== domain);
  } else {
    mute_list.push(domain);
  }

  await saveVault();
  await recheckActiveTabMood();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.target === OFFSCREEN_AUDIO_TARGET) return false;

  if (msg?.type === "MOOD_DETECTED") {
    const url = sender?.tab?.url || "";
    const domain = safeDomain(url);
    const hintMood = msg.mood && TRACKS.includes(msg.mood) ? msg.mood : "";
    const mood = chooseMood(domain, `${msg.rawText || ""} ${hintMood}`, msg.signals || {});
    routeDomainMood(domain, mood).catch(() => {});
    return false;
  }

  if (msg?.type === "POPUP_QUERY_STATE") {
    const domain = normalizeDomainLoose(msg.domain);
    sendResponse({
      domain,
      forcedTrack: domain_track_map[domain] || "",
      muted: mute_list.includes(domain),
      tracks: TRACKS,
      volume: master_volume,
      globalMuted: global_muted,
      activeTrack: active_track
    });
    return false;
  }

  if (msg?.type === "OPTIONS_GET_ALL") {
    const keys = new Set([...Object.keys(domain_track_map), ...mute_list]);
    const rows = [...keys].sort().map((domain) => ({
      domain,
      track: domain_track_map[domain] || "",
      muted: mute_list.includes(domain)
    }));
    sendResponse({ rows });
    return false;
  }

  (async () => {
    if (msg?.type === "POPUP_SET_TRACK") {
      const domain = normalizeDomainLoose(msg.domain);
      if (!domain) return;
      domain_track_map[domain] = msg.track;
      await saveVault();
      await routeDomainMood(domain, msg.track);
    }

    if (msg?.type === "POPUP_CLEAR_TRACK") {
      const domain = normalizeDomainLoose(msg.domain);
      if (!domain) return;
      delete domain_track_map[domain];
      await saveVault();
      await recheckActiveTabMood();
    }

    if (msg?.type === "POPUP_SET_MUTE") {
      const domain = normalizeDomainLoose(msg.domain);
      if (!domain) return;
      if (msg.muted && !mute_list.includes(domain)) mute_list.push(domain);
      if (!msg.muted) mute_list = mute_list.filter((d) => d !== domain);
      await saveVault();
      await routeDomainMood(domain, active_track || "Lofi");
    }

    if (msg?.type === "POPUP_SET_GLOBAL_MUTE") {
      global_muted = !!msg.muted;
      await saveVault();
      if (global_muted) {
        active_track = "";
        await sendAudio({ type: "AUDIO_STOP" });
      } else {
        await recheckActiveTabMood();
      }
    }

    if (msg?.type === "POPUP_SET_VOLUME") {
      master_volume = Math.max(0, Math.min(1, Number(msg.volume || 0.22)));
      await saveVault();
      await sendAudio({ type: "AUDIO_SET_VOLUME", volume: master_volume });
    }

    if (msg?.type === "OPTIONS_SAVE_DOMAIN") {
      const domain = normalizeDomainLoose(msg.domain);
      if (!domain) return;
      if (msg.track) domain_track_map[domain] = msg.track;
      if (!msg.track) delete domain_track_map[domain];
      if (msg.muted && !mute_list.includes(domain)) mute_list.push(domain);
      if (!msg.muted) mute_list = mute_list.filter((d) => d !== domain);
      await saveVault();
      if (domain === active_domain_string) await routeDomainMood(domain, active_track || "Lofi");
    }

    if (msg?.type === "OPTIONS_REMOVE_DOMAIN") {
      const domain = normalizeDomainLoose(msg.domain);
      delete domain_track_map[domain];
      mute_list = mute_list.filter((d) => d !== domain);
      await saveVault();
      if (domain === active_domain_string) await recheckActiveTabMood();
    }
  })()
    .then(() => sendResponse({ ok: true }))
    .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));

  return true;
});

initEngine().catch(() => {});
