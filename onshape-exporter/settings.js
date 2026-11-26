// Shared by the popup, the settings page and the background script.
const URL_RE = /^https:\/\/[\w-]+\.onshape\.com\/documents\/(\w+)\/([wvm])\/(\w+)\/e\/(\w+)/;
const HOST = "io.github.globiii.onshape_bambu";
const SETTING_DEFAULTS = {
  root: "",                                   // export folder; "" = ~/Downloads/onshape-export
  rootLabel: "",                              // the same path, shortened for display
  slicers: ["bambu", "orca", "prusa", "cura"], // shown in the popup
  dated: true,                                // folder name <date>_<version> instead of <version>
  archive: true,                              // move replaced files to archive/ instead of overwriting
  quality: "fine",                            // STL/3MF mesh resolution: coarse | medium | fine
  cacheDays: 7,                               // keep "Open only" temp files this long
};
async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return { ...SETTING_DEFAULTS, ...settings };
}
// The settings the helper needs with every message.
const helperSettings = (s) => ({ root: s.root, dated: s.dated, archive: s.archive, cacheDays: s.cacheDays });

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
  // Parts selected in Onshape's parts list: "selected" = the whole part, "related-highlight" = one of its faces/edges.
  // shortcut: reads Onshape's page, not an API, so a UI update can break it (then nothing is preselected).
  const picked = new Set([...document.querySelectorAll(
    ".part-list-container .os-list-item.selected, .part-list-container .os-list-item.related-highlight",
  )].map((e) => e.querySelector(".os-part-list-name")?.textContent.trim()));
  for (const p of parts) p.selected = picked.has(p.name);  // by name: same-named parts are picked together
  return { ok: parts, folder: [docName, studio, version] };
  } catch (e) { return { err: e.message }; }
}
