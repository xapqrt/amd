(async () => {
  const $ = (id) => document.getElementById(id);
  const tracks = ["", "Thriller", "Library", "Arcade", "Zen", "Cyberpunk", "Nature", "Space", "Radio", "Doom", "Lofi"];

  for (const t of tracks) {
    const o = document.createElement("option");
    o.value = t;
    o.textContent = t || "Auto Detect";
    $("trackSelect").appendChild(o);
  }

  async function loadRows() {
    const data = await chrome.runtime.sendMessage({ type: "OPTIONS_GET_ALL" });
    const tbody = $("domainTable");
    tbody.innerHTML = "";

    for (const row of data.rows) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${row.domain}</td><td>${row.track || "auto"}</td><td>${row.muted ? "yes" : "no"}</td><td><button data-kill="${row.domain}">x</button></td>`;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll("button[data-kill]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await chrome.runtime.sendMessage({ type: "OPTIONS_REMOVE_DOMAIN", domain: btn.dataset.kill });
        loadRows();
      });
    });
  }

  $("saveBtn").addEventListener("click", async () => {
    const domain = $("domainInput").value.trim().toLowerCase();
    if (!domain) return;
    const track = $("trackSelect").value;
    const muted = $("muteToggle").checked;
    await chrome.runtime.sendMessage({ type: "OPTIONS_SAVE_DOMAIN", domain, track, muted });
    $("status").textContent = `saved ${domain}`;
    loadRows();
  });

  $("reloadBtn").addEventListener("click", loadRows);
  loadRows();
})();
