(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const domain = new URL(tab.url).hostname.replace(/^www\./, "");
  document.getElementById("domain").textContent = domain;

  const state = await chrome.runtime.sendMessage({ type: "POPUP_QUERY_STATE", domain });
  const sel = document.getElementById("track");
  const status = document.getElementById("status");

  const autoOpt = document.createElement("option");
  autoOpt.value = "";
  autoOpt.textContent = "Auto Detect";
  sel.appendChild(autoOpt);

  for (const t of state.tracks) {
    const o = document.createElement("option");
    o.value = t;
    o.textContent = t;
    sel.appendChild(o);
  }

  sel.value = state.forcedTrack || "";
  status.textContent = state.forcedTrack ? `manual track: ${state.forcedTrack}` : "auto mood mode";
  document.getElementById("mute").checked = state.muted;

  sel.addEventListener("change", () => {
    if (!sel.value) {
      chrome.runtime.sendMessage({ type: "POPUP_CLEAR_TRACK", domain });
      status.textContent = "auto mood mode";
      return;
    }
    chrome.runtime.sendMessage({ type: "POPUP_SET_TRACK", domain, track: sel.value });
    status.textContent = `manual track: ${sel.value}`;
  });

  document.getElementById("mute").addEventListener("change", (e) => {
    chrome.runtime.sendMessage({
      type: "POPUP_SET_MUTE",
      domain,
      muted: e.target.checked
    });
  });
})();
