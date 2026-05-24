(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const domain = new URL(tab.url).hostname.replace(/^www\./, "");
  document.getElementById("domain").textContent = domain;

  const state = await chrome.runtime.sendMessage({ type: "POPUP_QUERY_STATE", domain });
  const sel = document.getElementById("track");

  for (const t of state.tracks) {
    const o = document.createElement("option");
    o.value = t;
    o.textContent = t;
    sel.appendChild(o);
  }

  if (state.forcedTrack) sel.value = state.forcedTrack;
  document.getElementById("mute").checked = state.muted;

  sel.addEventListener("change", () => {
    chrome.runtime.sendMessage({ type: "POPUP_SET_TRACK", domain, track: sel.value });
  });

  document.getElementById("mute").addEventListener("change", (e) => {
    chrome.runtime.sendMessage({
      type: "POPUP_SET_MUTE",
      domain,
      muted: e.target.checked
    });
  });
})();
