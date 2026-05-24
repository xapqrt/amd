(() => {
  const clusters = {
    Thriller: ["war", "crisis", "breaking", "threat"],
    Library: ["study", "history", "wiki", "archive"],
    Cyberpunk: ["github", "code", "tech", "terminal"]
  };

  function detectMood(text) {
    const lower = (text || "").toLowerCase();
    let bestMood = "Lofi";
    let bestScore = 0;
    for (const [mood, words] of Object.entries(clusters)) {
      let s = 0;
      for (const w of words) if (lower.includes(w)) s++;
      if (s > bestScore) {
        bestScore = s;
        bestMood = mood;
      }
    }
    return bestMood;
  }

  const meta = [...document.querySelectorAll("meta[name],meta[property]")]
    .map((m) => `${m.getAttribute("name") || m.getAttribute("property")}: ${m.content || ""}`)
    .join(" ");
  const raw = `${document.title}\n${meta}\n${document.body?.innerText || ""}`.slice(0, 12000);

  chrome.runtime.sendMessage({
    type: "MOOD_DETECTED",
    mood: detectMood(raw),
    rawText: raw
  });
})();
