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
  document.getElementById("domain").textContent = domain || "unsupported tab";

  const state = await chrome.runtime.sendMessage({ type: "POPUP_QUERY_STATE", domain });
  const sel = document.getElementById("track");
  const status = document.getElementById("status");
  const vol = document.getElementById("vol");
  const visualizer = document.getElementById("visualizer");

  function updateVisualizer(stateObj) {
    if (stateObj.globalMuted || stateObj.muted || (!stateObj.activeTrack && !stateObj.forcedTrack)) {
      visualizer.classList.remove("active");
    } else {
      visualizer.classList.add("active");
    }
  }

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
  
  function getStatusText() {
    if (state.globalMuted) return "Global Mute ON";
    if (state.forcedTrack) return `Manual track: ${state.forcedTrack}`;
    if (!domain) return "Unsupported page";
    return `Auto map: ${state.activeTrack || "idle"} (${state.activeReason || "waiting"})`;
  }
  
  status.textContent = getStatusText();
  vol.value = String(Math.round((state.volume ?? 0.22) * 100));
  document.getElementById("globalMute").checked = !!state.globalMuted;
  document.getElementById("mute").checked = state.muted;
  
  updateVisualizer(state);

  sel.addEventListener("change", () => {
    if (!domain) return;
    if (!sel.value) {
      chrome.runtime.sendMessage({ type: "POPUP_CLEAR_TRACK", domain });
      state.forcedTrack = "";
      status.textContent = getStatusText();
      visualizer.classList.add("active");
      return;
    }
    chrome.runtime.sendMessage({ type: "POPUP_SET_TRACK", domain, track: sel.value });
    state.forcedTrack = sel.value;
    status.textContent = getStatusText();
    visualizer.classList.add("active");
  });

  document.getElementById("mute").addEventListener("change", (e) => {
    if (!domain) return;
    const isMuted = e.target.checked;
    chrome.runtime.sendMessage({
      type: "POPUP_SET_MUTE",
      domain,
      muted: isMuted
    });
    if (isMuted) visualizer.classList.remove("active");
    else visualizer.classList.add("active");
  });

  document.getElementById("openSettings").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById("globalMute").addEventListener("change", (e) => {
    const isMuted = e.target.checked;
    chrome.runtime.sendMessage({ type: "POPUP_SET_GLOBAL_MUTE", muted: isMuted });
    state.globalMuted = isMuted;
    status.textContent = getStatusText();
    if (isMuted) visualizer.classList.remove("active");
    else visualizer.classList.add("active");
  });

  vol.addEventListener("input", () => {
    const v = Math.max(0, Math.min(100, Number(vol.value))) / 100;
    chrome.runtime.sendMessage({ type: "POPUP_SET_VOLUME", volume: v });
    status.textContent = `volume ${Math.round(v * 100)}%`;
  });
})();
