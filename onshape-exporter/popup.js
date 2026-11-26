const $ = (id) => document.getElementById(id);
const radio = (name) => document.querySelector(`input[name="${name}"]:checked`)?.value;
const setRadio = (name, v) => { const r = document.querySelector(`input[name="${name}"][value="${v}"]`); if (r) r.checked = true; };
let tabId, doc, folder;

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
    const box = Object.assign(document.createElement("input"), { type: "checkbox", value: p.id, checked: p.selected });
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
  chrome.runtime.sendMessage({ type: "export", tabId, doc, parts, format: radio("format"), slicer: radio("slicer"), action: radio("action"), folder });
});

$("open").addEventListener("click", async () => {
  try {
    const reply = await chrome.runtime.sendNativeMessage(HOST, { ...helperSettings(await getSettings()), openFolder: true, folder });
    $("status").textContent = reply.err ? `Helper error: ${reply.err}` : `Opened ${reply.dir}`;
  } catch (e) {
    $("status").textContent = `Helper not installed (${e.message}).`;
  }
});

chrome.runtime.onMessage.addListener((msg) => { if (msg.type === "status") $("status").textContent = msg.text; });
chrome.runtime.sendMessage({ type: "getStatus" }).then((t) => { if (t) $("status").textContent = t; }).catch(() => {});

// Which formats each slicer opens; for anything else the "Open" choices are disabled and it falls back to Save.
const SLICER_FORMATS = {
  bambu: ["STEP", "STL", "3MF"], orca: ["STEP", "STL", "3MF"], prusa: ["STEP", "STL", "3MF"], cura: ["STL", "3MF"],
};
function syncActions() {
  const canOpen = SLICER_FORMATS[radio("slicer")].includes(radio("format"));
  document.querySelectorAll('input[name="action"][value="both"], input[name="action"][value="open"]').forEach((r) => {
    r.disabled = !canOpen;
  });
  if (!canOpen && ["both", "open"].includes(radio("action"))) setRadio("action", "save");
}
// Remember the last choices in extension storage: the keyboard shortcut exports with them too.
const saveLast = () => chrome.storage.local.set({ last: { format: radio("format"), slicer: radio("slicer"), action: radio("action") } });
document.querySelectorAll('input[type="radio"]').forEach((r) => r.addEventListener("change", () => { syncActions(); saveLast(); }));

async function loadChoices() {
  let { last } = await chrome.storage.local.get("last");
  if (!last) {  // versions before 0.7 kept them in the popup's localStorage
    last = {};
    try { for (const id of ["format", "slicer", "action"]) last[id] = localStorage.getItem(`last-${id}`); } catch {}
  }
  const RENAMED = { download: "save", bambu: "open" };  // older names of actions
  setRadio("format", last.format || "STEP");
  setRadio("slicer", last.slicer || "bambu");
  setRadio("action", RENAMED[last.action] || last.action || "both");
  // Hide slicers turned off in the settings; if the remembered one is hidden, pick the first shown.
  const s = await getSettings();
  document.querySelectorAll('input[name="slicer"]').forEach((r) => (r.closest("label").hidden = !s.slicers.includes(r.value)));
  if (!s.slicers.includes(radio("slicer"))) setRadio("slicer", s.slicers[0]);
  syncActions();
  saveLast();  // so the shortcut matches what the popup shows
}
loadChoices();
$("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());

init().catch((e) => { $("parts").textContent = `Error: ${e.message}`; }).finally(() => {
  if ($("subtitle").textContent.endsWith("…")) $("subtitle").textContent = "";
});
