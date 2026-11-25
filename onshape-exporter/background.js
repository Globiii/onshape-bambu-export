// Runs exports in the background so they keep going after the popup closes.
const HOST = "io.github.globiii.onshape_bambu";
let lastStatus = "";

// Runs inside the Onshape tab (MAIN world), so fetch uses the user's own session.
// Must be self-contained and return {ok}|{err}: executeScript does not forward thrown errors.
async function exportInPage(d, parts, format) {
  try {
  // Every format goes through Onshape's translation service (the old /stl endpoint redirects cross-origin
  // and the browser blocks it). Extra params were found by testing against the live API.
  const FORMATS = {
    STEP: { ext: "step", params: {} },
    STL: { ext: "stl", params: { stlMode: "BINARY", resolution: "fine" } },
    "3MF": { ext: "3mf", params: { resolution: "fine" } },
    IGES: { ext: "igs", params: {} },
    PARASOLID: { ext: "x_t", params: {} },
  };
  const fmt = FORMATS[format];
  if (!fmt) throw new Error(`Unknown format ${format}`);
  if (d.wvm === "m") throw new Error("Export needs a workspace or version URL, not a microversion.");

  const base = `/api/v9/partstudios/d/${d.did}/${d.wvm}/${d.wvmid}/e/${d.eid}`;
  const check = async (r, what) => {
    if (!r.ok) throw new Error(`${what} failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
    return r;
  };
  const toB64 = (blob) => new Promise((res) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result.slice(fr.result.indexOf(",") + 1));
    fr.readAsDataURL(blob);
  });

  // Onshape writes STL in metres whatever unit is requested; slicers assume mm. Only rescale when the
  // header says metres, so this can't double-scale if Onshape ever honours the unit.
  const stlToMm = (buf) => {
    const header = new TextDecoder().decode(buf.slice(0, 80));
    if (!/Units = meters/i.test(header)) return buf;
    const v = new DataView(buf);
    const n = v.getUint32(80, true);
    if (buf.byteLength !== 84 + n * 50) throw new Error("Unexpected STL layout, not rescaling.");
    for (let t = 0; t < n; t++) {
      for (let k = 3; k < 12; k++) {  // skip the 3 normal floats, scale the 9 vertex floats
        const o = 84 + t * 50 + k * 4;
        v.setFloat32(o, v.getFloat32(o, true) * 1000, true);
      }
    }
    new Uint8Array(buf, 0, 80).set(new TextEncoder().encode(header.replace(/Units = meters/i, "Units = mm    ")));
    return buf;
  };

  const xsrf = document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1];
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (xsrf) headers["X-XSRF-TOKEN"] = decodeURIComponent(xsrf);
  // Async translation per part: start it, poll, then download the result.
  const translate = async (p) => {
    let t = await (await check(await fetch(`${base}/translations`, {
      method: "POST", headers,
      body: JSON.stringify({ formatName: format, partIds: p.id, storeInDocument: false, ...fmt.params }),
    }), `Starting ${format} export of ${p.name}`)).json();
    for (let i = 0; t.requestState === "ACTIVE"; i++) {
      if (i > 120) throw new Error(`${format} export of ${p.name} timed out after 2 minutes.`);
      await new Promise((res) => setTimeout(res, 1000));
      t = await (await check(await fetch(`/api/v9/translations/${t.id}`), `Checking ${format} export`)).json();
    }
    if (t.requestState !== "DONE") {
      throw new Error(`${format} export of ${p.name} ${t.requestState}: ${(t.failureReason || "").replace(/<[^>]+>/g, "")}`);
    }
    const r = await check(await fetch(`/api/v9/documents/d/${d.did}/externaldata/${t.resultExternalDataIds[0]}`), `Downloading ${format}`);
    const buf = await r.arrayBuffer();
    return new Blob([format === "STL" ? stlToMm(buf) : buf]);
  };

  const files = await Promise.all(parts.map(async (p) => ({ name: `${p.name}.${fmt.ext}`, b64: await toB64(await translate(p)) })));
  return { ok: files };
  } catch (e) { return { err: e.message }; }
}

function setStatus(text, badge) {
  lastStatus = text;
  chrome.action.setBadgeText({ text: badge });
  chrome.runtime.sendMessage({ type: "status", text }).catch(() => {});  // popup may be closed
}

// Plain browser downloads: the fallback when the helper is not installed.
function download(files, saveAs) {
  for (const f of files) {
    chrome.downloads.download({
      url: `data:application/octet-stream;base64,${f.b64}`,
      filename: f.name.replace(/[\\/:*?"<>|]+/g, "_"),
      saveAs,
    });
  }
}

const SLICER_NAMES = { bambu: "Bambu Studio", orca: "OrcaSlicer", cura: "UltiMaker Cura" };
const DONE = {
  both: (n, dir, app) => `Opened ${n} file(s) in ${app} and saved to ${dir}.`,
  open: (n, dir, app) => `Opened ${n} file(s) in ${app}.`,
  save: (n, dir) => `Saved ${n} file(s) to ${dir}.`,
  saveas: (n, dir) => `Saved ${n} file(s) to ${dir}.`,
};

async function runExport({ tabId, doc, parts, format, slicer, action, folder }) {
  setStatus(`Exporting ${parts.length} part(s) as ${format}…`, "…");
  // A long-running executeScript is not activity; ping an API so Chrome keeps this worker alive.
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(), 20000);
  try {
    const [inj] = await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func: exportInPage, args: [doc, parts, format] });
    const res = inj?.result ?? { err: "Could not run in the Onshape tab. Reload it and try again." };
    if (res.err) return setStatus(res.err, "!");
    if (action === "saveas") setStatus("Choose a folder in the dialog…", "…");
    try {
      const reply = await chrome.runtime.sendNativeMessage(HOST, { files: res.ok, mode: action, slicer, folder });
      if (reply.cancelled) return setStatus("Save cancelled.", "");
      if (reply.err) return setStatus(`Helper error: ${reply.err}`, "!");
      setStatus((DONE[action] || DONE.both)(res.ok.length, reply.dir, SLICER_NAMES[slicer] || "the slicer"), "✓");
    } catch (e) {
      download(res.ok, action === "saveas");
      setStatus(`Helper not installed (${e.message}); downloaded with Chrome instead.`, "!");
    }
  } catch (e) {
    setStatus(`Export failed: ${e.message}`, "!");
  } finally {
    clearInterval(keepAlive);
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === "export") runExport(msg);
  if (msg.type === "getStatus") reply(lastStatus);
});
