// Shared by the popup, the settings page and the background script.
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
