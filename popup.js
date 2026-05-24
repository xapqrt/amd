(async () => {
  function cleanDomain(rawUrl) {
    try {
      return new URL(rawUrl).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      return "";
    }
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const domain = cleanDomain(tab?.url || "");
  document.getElementById("domain").textContent = domain;

  const state = await chrome.runtime.sendMessage({ type: "POPUP_QUERY_STATE", domain });
  const sel = document.getElementById("track");
  const status = document.getElementById("status");
  const vol = document.getElementById("vol");

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
  vol.value = String(Math.round((state.volume ?? 0.22) * 100));
  document.getElementById("globalMute").checked = !!state.globalMuted;
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

  document.getElementById("openSettings").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById("globalMute").addEventListener("change", (e) => {
    chrome.runtime.sendMessage({ type: "POPUP_SET_GLOBAL_MUTE", muted: e.target.checked });
    status.textContent = e.target.checked ? "global mute ON" : "global mute OFF";
  });

  vol.addEventListener("input", () => {
    const v = Math.max(0, Math.min(100, Number(vol.value))) / 100;
    chrome.runtime.sendMessage({ type: "POPUP_SET_VOLUME", volume: v });
    status.textContent = `volume ${Math.round(v * 100)}%`;
  });
})();
