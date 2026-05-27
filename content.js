(() => {
  const clusters = {
    Thriller: ["war", "crisis", "breaking", "threat", "attack", "panic", "emergency", "tension", "scandal"],
    Library: ["study", "history", "wiki", "archive", "literature", "reference", "research", "journal", "documentary", "academic"],
    Arcade: ["arcade", "retro", "score", "combo", "pixel", "platformer", "multiplayer", "play", "gaming", "esports"],
    Zen: ["mindful", "calm", "meditation", "breath", "yoga", "stillness", "peace", "relax", "healing", "wellness"],
    Cyberpunk: ["github", "code", "tech", "terminal", "hacker", "binary", "blockchain", "cyber", "ai", "machine learning"],
    Nature: ["forest", "river", "wildlife", "earth", "mountain", "garden", "climate", "environment", "eco", "camping"],
    Space: ["space", "orbit", "planet", "cosmos", "nasa", "galaxy", "astronomy", "universe", "alien", "telescope"],
    Radio: ["podcast", "broadcast", "station", "fm", "live", "host", "news", "talk", "interview", "discussion"],
    Doom: ["horror", "doom", "apocalypse", "demon", "nightmare", "dark", "blood", "evil", "survival", "zombie"],
    Lofi: ["lofi", "chill", "focus", "beats", "vibes", "night", "aesthetic", "cozy", "cafe", "studying"]
  };

  function detectMood(text) {
    const lower = (text || "").toLowerCase();
    let bestMood = "Lofi";
    let bestScore = 0;
    for (const [mood, words] of Object.entries(clusters)) {
      let s = 0;
      for (const w of words) {
        if (!lower.includes(w)) continue;
        s += 1;
        if (w.length > 6) s += 0.5;
      }
      if (s > bestScore) {
        bestScore = s;
        bestMood = mood;
      }
    }
    return bestMood;
  }

  function buildRawText() {
    const meta = [...document.querySelectorAll("meta[name],meta[property]")]
      .map((m) => `${m.getAttribute("name") || m.getAttribute("property")}: ${m.content || ""}`)
      .join(" ");
    const pathHints = `${location.hostname} ${location.pathname}`;
    return `${document.title}\n${meta}\n${pathHints}\n${document.body?.innerText || ""}`.slice(0, 18000);
  }

  function pushMood() {
    let raw = buildRawText();
    const signals = {
      headingCount: document.querySelectorAll("h1,h2,h3").length,
      linkCount: document.querySelectorAll("a").length,
      articleCount: document.querySelectorAll("article").length,
      hasCode: !!document.querySelector("pre,code"),
      hasVideo: !!document.querySelector("video,iframe[src*='youtube'],iframe[src*='vimeo']")
    };

    if (signals.hasCode) {
      raw += " code-snippets terminal stacktrace commit";
    }

    chrome.runtime.sendMessage({
      type: "MOOD_DETECTED",
      mood: detectMood(raw),
      rawText: raw,
      signals
    });
  }

  pushMood();

  let debounce_timer = null;
  const obs = new MutationObserver(() => {
    clearTimeout(debounce_timer);
    debounce_timer = setTimeout(pushMood, 800);
  });
  obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
})();
