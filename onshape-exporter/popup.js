const URL_RE = /^https:\/\/[\w-]+\.onshape\.com\/documents\/(\w+)\/([wvm])\/(\w+)\/e\/(\w+)/;
const $ = (id) => document.getElementById(id);
const radio = (name) => document.querySelector(`input[name="${name}"]:checked`)?.value;
const setRadio = (name, v) => { const r = document.querySelector(`input[name="${name}"][value="${v}"]`); if (r) r.checked = true; };
let tabId, doc, folder;

// Runs inside the Onshape tab (MAIN world), so fetch uses the user's own session.
// Must be self-contained and return {ok}|{err}: executeScript does not forward thrown errors.

async function listPartsInPage(d) {
  try {
  const r = await fetch(`/api/v9/parts/d/${d.did}/${d.wvm}/${d.wvmid}/e/${d.eid}`);
  if (!r.ok) throw new Error(`Listing parts failed (${r.status}). Is this a Part Studio?`);
  const parts = (await r.json()).filter((p) => p.bodyType === "solid").map((p) => ({ id: p.partId, name: p.name }));

  // Names for the export folder; any failure falls back to ids so export still works.
  const json = async (url) => {
    const x = await fetch(url, { signal: AbortSignal.timeout(5000) });  // names are optional, never block the popup on them
    if (!x.ok) throw new Error(x.status);
    return x.json();
  };
  const [docName, studio, version] = await Promise.all([
    json(`/api/v9/documents/${d.did}`).then((x) => x.name).catch(() => d.did),
    json(`/api/v9/documents/d/${d.did}/${d.wvm}/${d.wvmid}/elements`)
      .then((els) => els.find((e) => e.id === d.eid)?.name || d.eid).catch(() => d.eid),
    d.wvm === "v" ? json(`/api/v9/documents/d/${d.did}/versions/${d.wvmid}`).then((x) => x.name).catch(() => d.wvmid)
      : d.wvm === "w" ? workspaceVersion().catch(() => "workspace") : "microversion",
  ]);

  // A workspace has no name of its own: use the newest version, marked "+edits" if the workspace changed since.
  // shortcut: newest version across all branches, use the workspace's own parent version if you work with branches.
  async function workspaceVersion() {
    const [versions, workspaces] = await Promise.all([
      json(`/api/v9/documents/d/${d.did}/versions`),
      json(`/api/v9/documents/d/${d.did}/workspaces`),
    ]);
    if (!versions.length) return "no version";
    const latest = versions.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
    const ws = workspaces.find((w) => w.id === d.wvmid);
    return ws && ws.microversion === latest.microversion ? latest.name : `${latest.name}+edits`;
  }
  return { ok: parts, folder: [docName, studio, version] };
  } catch (e) { return { err: e.message }; }
}

async function runInTab(func, ...args) {
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func, args });
  return res?.result ?? { err: "Could not run in the Onshape tab. Reload it and try again." };
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const m = tab?.url?.match(URL_RE);
  if (!m) { $("parts").textContent = "Open an Onshape Part Studio tab first."; return; }
  tabId = tab.id;
  doc = { did: m[1], wvm: m[2], wvmid: m[3], eid: m[4] };

  const res = await runInTab(listPartsInPage, doc);
  if (res.err) { $("parts").textContent = res.err; return; }
  if (!res.ok.length) { $("parts").textContent = "No solid parts in this Part Studio."; return; }
  folder = res.folder;
  $("subtitle").textContent = `${folder[1]} · ${folder[2]}`;

  $("parts").replaceChildren(...res.ok.map((p) => {
    const label = document.createElement("label");
    const box = Object.assign(document.createElement("input"), { type: "checkbox", value: p.id });
    box.dataset.name = p.name;
    label.append(box, " ", p.name);
    return label;
  }));
  updateCount();
}

function updateCount() {
  const boxes = [...document.querySelectorAll("#parts input")];
  const n = boxes.filter((b) => b.checked).length;
  $("count").textContent = boxes.length ? `${n} of ${boxes.length} selected` : "";
  $("all").checked = n > 0 && n === boxes.length;
  $("export").disabled = n === 0;
}

$("all").addEventListener("change", (e) => {
  document.querySelectorAll("#parts input").forEach((b) => (b.checked = e.target.checked));
  updateCount();
});
$("parts").addEventListener("change", updateCount);

$("export").addEventListener("click", () => {
  const parts = [...document.querySelectorAll("#parts input:checked")].map((b) => ({ id: b.value, name: b.dataset.name }));
  if (!parts.length) { $("status").textContent = "Pick at least one part."; return; }
  // The background worker does the export, so closing this popup doesn't stop it.
  chrome.runtime.sendMessage({ type: "export", tabId, doc, parts, format: radio("format"), action: radio("action"), folder });
});

const HOST = "io.github.globiii.onshape_bambu";

$("open").addEventListener("click", async () => {
  try {
    const reply = await chrome.runtime.sendNativeMessage(HOST, { openFolder: true, folder });
    $("status").textContent = reply.err ? `Helper error: ${reply.err}` : `Opened ${reply.dir}`;
  } catch (e) {
    $("status").textContent = `Bambu helper not installed (${e.message}).`;
  }
});

chrome.runtime.onMessage.addListener((msg) => { if (msg.type === "status") $("status").textContent = msg.text; });
chrome.runtime.sendMessage({ type: "getStatus" }).then((t) => { if (t) $("status").textContent = t; }).catch(() => {});

// Remember the last choices (default STEP + Both); storage can be unavailable, so never let it break the popup.
// "last-" keys are new so an older saved "Open in Bambu" choice doesn't override the new default.
for (const [id, def] of [["format", "STEP"], ["action", "both"]]) {
  const key = `last-${id}`;
  setRadio(id, def);
  try {
    const saved = localStorage.getItem(key);
    setRadio(id, saved === "download" ? "save" : saved || def);  // "download" was renamed to "save"
  } catch {}
  document.querySelectorAll(`input[name="${id}"]`).forEach((r) =>
    r.addEventListener("change", () => { try { localStorage.setItem(key, r.value); } catch {} }));
}

// Bambu Studio can't open IGES/Parasolid: disable the Bambu choices and fall back to Save.
const BAMBU_FORMATS = ["STEP", "STL", "3MF"];
function syncActions() {
  const bambuOk = BAMBU_FORMATS.includes(radio("format"));
  document.querySelectorAll('input[name="action"][value="both"], input[name="action"][value="bambu"]').forEach((r) => {
    r.disabled = !bambuOk;
  });
  if (!bambuOk && ["both", "bambu"].includes(radio("action"))) setRadio("action", "save");
}
document.querySelectorAll('input[name="format"]').forEach((r) => r.addEventListener("change", syncActions));
syncActions();

init().catch((e) => { $("parts").textContent = `Error: ${e.message}`; }).finally(() => {
  if ($("subtitle").textContent.endsWith("…")) $("subtitle").textContent = "";
});
