const $ = (id) => document.getElementById(id);
let s;

async function save(change) {
  Object.assign(s, change);
  await chrome.storage.local.set({ settings: s });
  $("saved").textContent = "Saved.";
  setTimeout(() => ($("saved").textContent = ""), 1500);
}

async function helper(msg) {
  return chrome.runtime.sendNativeMessage(HOST, { ...helperSettings(s), ...msg });
}

async function checkHelper() {
  $("helper").className = "";
  $("helper").textContent = "Checking…";
  try {
    const r = await helper({ status: true });
    if (r.err) throw new Error(r.err);
    $("helper").className = "ok";
    $("helper").textContent = "Helper installed.";
    if (!s.root) $("root").textContent = `${r.defaultRoot} (default)`;
    for (const [key, ok] of Object.entries(r.slicers)) {
      const tag = document.querySelector(`.tag[data-for="${key}"]`);
      tag.textContent = ok ? "found" : "not found";
      tag.classList.toggle("found", ok);
    }
  } catch (e) {
    $("helper").className = "err";
    $("helper").textContent = `Helper not reachable: ${e.message}. Run the installer from the GitHub page, then check again.`;
  }
}

function showRoot() {
  $("root").textContent = s.root ? s.rootLabel || s.root : "~/Downloads/onshape-export (default)";
}

async function init() {
  s = await getSettings();
  showRoot();
  document.querySelectorAll("#slicers input").forEach((b) => (b.checked = s.slicers.includes(b.value)));
  $("dated").checked = s.dated;
  $("archive").checked = s.archive;
  $("cacheDays").value = s.cacheDays;
  document.querySelector(`input[name="quality"][value="${s.quality}"]`).checked = true;
  checkHelper();
}

$("recheck").addEventListener("click", checkHelper);

chrome.commands.getAll().then((cmds) => {
  $("shortcut").textContent = cmds.find((c) => c.name === "quick-export")?.shortcut || "Not set";
});
$("changeShortcut").addEventListener("click", () => {
  // Firefox has an API for its shortcut page; Chrome lets extensions open chrome://extensions/shortcuts.
  if (chrome.commands.openShortcutSettings) chrome.commands.openShortcutSettings();
  else chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

$("pick").addEventListener("click", async () => {
  $("saved").textContent = "Choose a folder in the dialog…";
  try {
    const r = await helper({ pickRoot: true });
    if (r.err) throw new Error(r.err);
    if (r.cancelled) { $("saved").textContent = ""; return; }
    await save({ root: r.path, rootLabel: r.dir });
    showRoot();
  } catch (e) {
    $("saved").textContent = `Could not open the folder dialog: ${e.message}`;
  }
});

$("reset").addEventListener("click", async () => {
  await save({ root: "", rootLabel: "" });
  showRoot();
});

$("openRoot").addEventListener("click", async () => {
  try {
    const r = await helper({ openFolder: true });
    $("saved").textContent = r.err ? `Helper error: ${r.err}` : `Opened ${r.dir}`;
  } catch (e) {
    $("saved").textContent = `Helper not reachable: ${e.message}`;
  }
});

$("slicers").addEventListener("change", (e) => {
  const on = [...document.querySelectorAll("#slicers input:checked")].map((b) => b.value);
  if (!on.length) {  // the popup needs at least one
    e.target.checked = true;
    $("saved").textContent = "Keep at least one slicer.";
    return;
  }
  save({ slicers: on });
});
$("dated").addEventListener("change", (e) => save({ dated: e.target.checked }));
$("archive").addEventListener("change", (e) => save({ archive: e.target.checked }));
$("cacheDays").addEventListener("change", (e) => {
  const days = Math.min(365, Math.max(1, Math.round(Number(e.target.value)) || 7));
  e.target.value = days;
  save({ cacheDays: days });
});
$("quality").addEventListener("change", (e) => save({ quality: e.target.value }));

init();
