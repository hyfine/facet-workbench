(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const tools = {
    compare: ["01 / STRUCTURAL DIFF", "Compare workspace", "Trace matching blocks across two documents. See the changes that matter.", "CORRESPONDENCE"],
    json: ["02 / DOCUMENT LAB", "JSON Studio", "Repair the syntax, explore the tree and keep your original untouched.", "TRANSFORMATION"],
    base64: ["03 / TEXT CODEC", "Base64 codec", "Decode text or encode a verified UTF-8 payload on your device.", "TRANSLATION"]
  };
  function navigate() {
    const key = location.hash.slice(1);
    const id = Object.hasOwn(tools, key) ? key : "compare";
    for (const link of document.querySelectorAll("[data-tool]")) {
      const current = link.dataset.tool === id;
      $(link.dataset.tool).hidden = !current;
      if (current) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
    }
    const [label, heading, subtitle, figure] = tools[id];
    $("kicker").textContent = "INSTRUMENT " + label;
    $("heading").textContent = heading; $("subtitle").textContent = subtitle;
    $("figcaption").textContent = `FIG ${label.slice(0, 2)} / ${figure}`;
    document.title = heading + " · Facet";
    clearLink();
  }
  window.addEventListener("hashchange", navigate);
  document.addEventListener("keydown", e => {
    if (!e.altKey || e.ctrlKey || e.metaKey || $("viewer").open) return;
    const key = { "1": "compare", "2": "json", "3": "base64" }[e.key];
    if (key) { e.preventDefault(); location.hash = key; }
  });
  let noticeTimer;
  function notice(msg) {
    clearTimeout(noticeTimer); $("toast").textContent = msg;
    noticeTimer = setTimeout(() => { $("toast").textContent = ""; }, 3500);
  }
  function status(id, label, msg, error = false) {
    const box = $(id);
    box.classList.toggle("error", error);
    box.replaceChildren(el("span", "state", label));
    if (msg) box.append(el("span", "", msg));
  }
  function copy(text) {
    if (!navigator.clipboard) { notice("Clipboard unavailable here. Select the output and copy manually."); return; }
    navigator.clipboard.writeText(text).then(() => notice("Copied to clipboard."),
      () => notice("Clipboard access denied. Select the output and copy manually."));
  }
  let fileTarget;
  function chooseFile(input, onLoad, onError) {
    fileTarget = { input, onLoad, onError };
    $("picker").value = ""; $("picker").click();
  }
  $("picker").onchange = async () => {
    const f = $("picker").files[0], target = fileTarget;
    if (!f || !target) return;
    try {
      if (f.size > 1024 * 1024) throw Error("File exceeds the 1 MiB limit.");
      const bytes = new Uint8Array(await f.arrayBuffer());
      const enc = bytes[0] === 255 && bytes[1] === 254 ? "utf-16le" :
        bytes[0] === 254 && bytes[1] === 255 ? "utf-16be" : "utf-8";
      let text;
      try { text = new TextDecoder(enc, { fatal: true }).decode(bytes); }
      catch { throw Error("Use a UTF-8 or BOM-marked UTF-16 text file."); }
      if (text.includes("\0")) throw Error("This file contains binary data, not text.");
      target.input.value = text; target.onLoad(f.name, text);
    } catch (e) { target.onError(e.message); }
  };
  function debounce(fn) {
    let timer;
    return () => { clearTimeout(timer); timer = setTimeout(fn, 140); };
  }

  const sampleA = { service: "atlas", engine: { region: "eu-west", replicas: 3 }, release: "1.4", channels: ["web", "cli"], legacy: true };
  const sampleB = { release: "1.5", channels: ["cli", "web"], service: "atlas", engine: { replicas: 3, region: "eu-west" }, health: "ready" };
  const inputs = [$("input0"), $("input1")], panes = [$("rows0"), $("rows1")];
  const names = [$("name0"), $("name1")];
  let editing = false, active = null, peers = new WeakMap();
  function clearLink() {
    if (active) active.forEach(r => r.classList.remove("linked"));
    active = null; $("bridge").removeAttribute("d");
  }
  function draw() {
    if (!active) return;
    const base = $("split").getBoundingClientRect();
    const [a, b] = active.map(r => r.getBoundingClientRect());
    const v = panes.map(p => p.getBoundingClientRect());
    if (a.bottom <= v[0].top || a.top >= v[0].bottom || b.bottom <= v[1].top || b.top >= v[1].bottom) {
      $("bridge").removeAttribute("d"); return;
    }
    const x = a.right - base.left, z = b.left - base.left, mid = (x + z) / 2;
    const top = (r, p) => Math.max(r.top, p.top) - base.top;
    const bottom = (r, p) => Math.min(r.bottom, p.bottom) - base.top;
    const y = top(a, v[0]), t = top(b, v[1]), u = bottom(a, v[0]), w = bottom(b, v[1]);
    $("bridge").setAttribute("d", `M${x} ${y} C${mid} ${y} ${mid} ${t} ${z} ${t} V${w} C${mid} ${w} ${mid} ${u} ${x} ${u} Z`);
  }
  function trace(row, side) {
    if (active?.includes(row)) return;
    clearLink();
    const peer = peers.get(row);
    if (!peer || !row.classList.contains("same")) return;
    active = side === 0 ? [row, peer] : [peer, row];
    const p = panes[1 - side], area = p.getBoundingClientRect(), r = peer.getBoundingClientRect();
    if (r.top < area.top || r.bottom > area.bottom) p.scrollTop += r.top - area.top - p.clientHeight / 3;
    active.forEach(n => n.classList.add("linked")); draw();
  }
  panes.forEach((pane, side) => {
    for (const event of ["pointerover", "focusin"]) pane.addEventListener(event, e => {
      const row = e.target.closest(".row");
      if (row) trace(row, side);
    });
    for (const event of ["pointerleave", "focusout"]) pane.addEventListener(event, clearLink);
    pane.addEventListener("scroll", draw, { passive: true });
    pane.addEventListener("keydown", e => {
      if (!["ArrowDown", "ArrowUp"].includes(e.key)) return;
      const next = e.key === "ArrowDown" ? e.target.nextElementSibling : e.target.previousElementSibling;
      if (next?.matches(".row")) { e.preventDefault(); next.focus(); }
    });
  });
  window.addEventListener("resize", draw);
  const signs = { same: "=", changed: "~", added: "+", removed: "−" };
  function makeRow(num, state, body, depth = 0) {
    const r = el("div", "row " + state); r.tabIndex = num === 1 ? 0 : -1;
    r.title = state[0].toUpperCase() + state.slice(1);
    r.style.setProperty("--depth", depth);
    r.append(el("span", "lineno", num), el("span", "sign", signs[state]), body);
    return r;
  }
  const connect = (a, b) => { peers.set(a, b); peers.set(b, a); };
  function nodeBody(n, key, readable = false) {
    const span = el("span", "row-body");
    if (key !== undefined) span.append(el("span", "field", key + "  "));
    span.append(n.children ? el("span", "node-count", n.type === "object" ? `{${n.children.length}}` : `[${n.children.length}]`)
      : el("span", n.type, readable && n.type === "string" ? n.value || '""' : FacetJSON.literal(n)));
    return span;
  }
  function renderJSON(roots, result) {
    const rows = new Map();
    roots.forEach((root, side) => {
      const frag = document.createDocumentFragment(); let num = 0;
      function walk(n, key, depth) {
        const row = makeRow(++num, result.marks.get(n).status, nodeBody(n, key), depth);
        rows.set(n, row); frag.append(row);
        n.children?.forEach(c => walk(c.node, n.type === "array" ? `[${c.key}]` : JSON.stringify(c.key), depth + 1));
      }
      walk(root, "$", 0); panes[side].append(frag);
    });
    for (const [n, r] of rows) {
      const mark = result.marks.get(n);
      if (mark.status === "same") connect(r, rows.get(mark.peer));
    }
  }
  function renderText(result) {
    const frags = panes.map(() => document.createDocumentFragment());
    for (const { i, j, status: state } of result.pairs) {
      const a = i === null ? null : makeRow(i + 1, state, el("span", "row-body", result.a[i] || "↵"));
      const b = j === null ? null : makeRow(j + 1, state, el("span", "row-body", result.b[j] || "↵"));
      if (a) frags[0].append(a);
      if (b) frags[1].append(b);
      if (state === "same") connect(a, b);
    }
    panes.forEach((p, i) => p.append(frags[i]));
  }
  function compare() {
    clearLink(); peers = new WeakMap(); panes.forEach(p => p.replaceChildren());
    const values = inputs.map(i => i.value);
    try {
      if (values.some(s => s.length > FacetJSON.MAX_INPUT)) throw Error("Input exceeds the 1 Mi-character limit.");
      const mode = $("mode").value;
      const isJSON = mode === "json" || (mode === "auto" &&
        (values.some(s => /^\s*[[{]/.test(s)) || names.some(n => /\.json$/i.test(n.textContent)) ||
         values.every(s => { try { FacetJSON.parse(s); return true; } catch { return false; } })));
      $("order").disabled = !isJSON;
      let result;
      if (isJSON) {
        const roots = values.map((s, i) => {
          try {
            const { root, count } = FacetJSON.parse(s);
            if (count > 3000) throw Error("Compare supports up to 3,000 JSON values per side.");
            return root;
          } catch (e) { throw Error(`${i ? "Revision" : "Original"}: ${e.message}`); }
        });
        result = FacetDiff.jsonDiff(...roots, $("order").checked);
        renderJSON(roots, result);
      } else {
        result = FacetDiff.textDiff(...values); renderText(result);
      }
      status("diff-status", isJSON ? "Structural JSON" : "Line diff", result.equal ? "Identical" : "Differences found");
      for (const [key, count] of Object.entries(result.counts))
        $("diff-status").append(el("span", "metric " + key, `${signs[key]} ${count} ${key}`));
      panes.forEach(p => { if (!p.children.length) p.append(el("div", "empty", "Empty document")); });
    } catch (e) {
      status("diff-status", "Cannot compare", e.message, true);
      panes.forEach(p => p.append(el("div", "empty", "Edit the inputs, repair JSON in Studio, or choose Text mode.")));
    }
  }
  function setEditing(on) {
    editing = on; clearLink();
    $("edit").textContent = on ? "Compare now" : "Edit inputs"; $("edit").setAttribute("aria-expanded", on);
    inputs.forEach((input, i) => { input.hidden = !on; panes[i].hidden = on; });
    $("hint").textContent = on ? "Paste into either side, then choose Compare now." : "Hover or focus a matching row to trace its counterpart. Use ↑ / ↓ to navigate.";
    if (on) { status("diff-status", "Editing", "Changes stay on this device."); inputs[0].focus(); }
    else compare();
  }
  function diffSample() {
    [sampleA, sampleB].forEach((value, i) => {
      inputs[i].value = JSON.stringify(value, null, 2); names[i].textContent = i ? "atlas.after.json" : "atlas.before.json";
    });
    $("mode").value = "auto"; $("order").checked = false; setEditing(false);
  }
  $("edit").onclick = () => setEditing(!editing); $("diff-example").onclick = diffSample;
  $("mode").onchange = $("order").onchange = () => { if (!editing) compare(); };
  document.querySelectorAll("[data-file]").forEach(b => {
    const i = Number(b.dataset.file);
    inputs[i].oninput = () => { names[i].textContent = i ? "Revised text" : "Original text"; };
    b.onclick = () => chooseFile(inputs[i], name => {
      names[i].textContent = name; if (!editing) compare(); else status("diff-status", "Editing", "File opened. Choose Compare now.");
    }, msg => status("diff-status", "File not opened", msg, true));
  });

  const imperfect = "{\n  project: 'Atlas',\n  // Preview configuration\n  channels: ['web', 'cli',],\n  telemetry: false,\n}";
  let doc = null, formatted = "", view = "tree";
  function tree(n, key, depth) {
    if (!n.children) { const leaf = el("div", "leaf"); leaf.append(nodeBody(n, key, $("unpack").checked)); return leaf; }
    const details = el("details"); details.open = depth < 2;
    const summary = el("summary"); summary.append(nodeBody(n, key)); details.append(summary);
    for (const c of n.children) details.append(tree(c.node, n.type === "array" ? `[${c.key}]` : JSON.stringify(c.key), depth + 1));
    return details;
  }
  function showJSON(target) {
    target.replaceChildren();
    if (!doc) { target.append(el("span", "empty", "Valid output will appear here.")); return; }
    if (view === "text") target.append(el("pre", "", formatted));
    else { const root = el("div", "tree"); root.append(tree(doc.root, "$", 0)); target.append(root); }
  }
  function updateJSON() {
    doc = null; formatted = "";
    const s = $("json-input").value;
    if (!s.trim()) status("json-status", "Ready", "Paste a document to begin.");
    else try {
      const source = FacetJSON.parse(s, $("repair").checked);
      const output = $("unpack").checked ? FacetJSON.unpackStrings(source) : source;
      formatted = FacetJSON.format(output.root, Number($("indent").value));
      doc = output;
      const notes = [...doc.fixes].map(([label, count]) => `${label} ×${count}`);
      if (doc.unpacked) notes.push(`Unpacked JSON strings: ${doc.unpacked}`);
      if (doc.limited) notes.push(`Kept as text (expansion limit): ${doc.limited}`);
      if (!notes.length) notes.push(`${doc.count} values`);
      status("json-status", doc.fixes.size ? "Repaired" : "Valid JSON", [...notes, "Source unchanged"].join(" · "));
    } catch (e) { status("json-status", "Invalid JSON", e.message, true); }
    showJSON($("json-output"));
    for (const id of ["copy-json", "save-json", "pop"]) $(id).disabled = !doc;
    for (const id of ["fold", "unfold"]) $(id).disabled = !doc || view !== "tree";
    document.querySelectorAll("[data-view]").forEach(b => b.setAttribute("aria-pressed", b.dataset.view === view));
  }
  const queueJSON = debounce(updateJSON);
  $("json-input").oninput = () => {
    for (const id of ["copy-json", "save-json", "pop"]) $(id).disabled = true;
    queueJSON();
  };
  $("repair").onchange = $("unpack").onchange = $("indent").onchange = updateJSON;
  $("json-example").onclick = () => { $("json-input").value = imperfect; updateJSON(); };
  $("json-file").onclick = () => chooseFile($("json-input"), updateJSON, msg => status("json-status", "File not opened", msg, true));
  document.querySelectorAll("[data-view]").forEach(b => { b.onclick = () => { view = b.dataset.view; updateJSON(); }; });
  for (const [id, open] of [["fold", false], ["unfold", true]])
    $(id).onclick = () => $("json-output").querySelectorAll("details").forEach(d => { d.open = open; });
  $("pop").onclick = () => { showJSON($("viewer-body")); $("viewer").showModal(); };
  $("close").onclick = () => $("viewer").close();
  let zoom = 100;
  const displays = document.querySelectorAll(".display-tools");
  function refreshDisplay() {
    document.documentElement.style.setProperty("--content-scale", zoom / 100);
    for (const bar of displays) {
      const host = bar.closest(".view-host");
      const full = host === document.fullscreenElement || host.classList.contains("tab-full");
      const toggle = bar.querySelector("[data-full]");
      toggle.textContent = full ? "Exit fullscreen" : "Fullscreen";
      toggle.setAttribute("aria-pressed", full);
      bar.querySelector('[data-zoom="-25"]').disabled = zoom === 75;
      bar.querySelector('[data-zoom="25"]').disabled = zoom === 200;
      bar.querySelector('[data-zoom="0"]').textContent = zoom + "%";
    }
    draw();
  }
  for (const bar of displays) {
    bar.append($("display-controls").content.cloneNode(true));
    bar.onclick = async e => {
      const button = e.target.closest("button");
      if (!button) return;
      const host = bar.closest(".view-host");
      if (button.hasAttribute("data-zoom")) {
        const step = Number(button.dataset.zoom);
        zoom = step ? Math.min(200, Math.max(75, zoom + step)) : 100;
      } else if (host === document.fullscreenElement) {
        try { await document.exitFullscreen(); } catch (err) { notice(err.message); }
      } else if (host.classList.contains("tab-full")) {
        host.classList.remove("tab-full");
      } else {
        try {
          if (document.fullscreenEnabled) await host.requestFullscreen();
          else host.classList.add("tab-full");
        } catch (err) {
          host.classList.add("tab-full");
          notice("Browser fullscreen unavailable. Using the full tab instead.");
        }
      }
      refreshDisplay();
    };
  }
  document.addEventListener("fullscreenchange", refreshDisplay);
  document.addEventListener("keydown", e => {
    const host = $("viewer").open ? $("viewer-panel") : $("workspace");
    if (e.key === "Escape" && host.classList.contains("tab-full")) {
      e.preventDefault(); host.classList.remove("tab-full"); refreshDisplay();
    }
  });
  $("viewer").addEventListener("close", () => {
    $("viewer-panel").classList.remove("tab-full");
    if (document.fullscreenElement === $("viewer-panel")) document.exitFullscreen().catch(err => notice(err.message));
    refreshDisplay();
  });
  refreshDisplay();
  $("copy-json").onclick = () => copy(formatted);
  $("save-json").onclick = () => {
    const url = URL.createObjectURL(new Blob([formatted + "\n"], { type: "application/json" }));
    const a = el("a"); a.href = url; a.download = "formatted.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const codecMode = () => $("b64-mode").value;
  const codecDrafts = { decode: "", source: "" };
  const draftKey = () => codecMode() === "decode" ? "decode" : "source";
  function updateBase64() {
    let result;
    const mode = codecMode(), decoding = mode === "decode", json = mode === "json";
    const input = codecDrafts[draftKey()];
    $("b64-format").disabled = !input.trim();
    if (decoding ? !input.trim() : !input.length) status("b64-status", "Ready", "Paste input or open a file.");
    else try {
      const field = $("b64-field").value || null;
      result = decoding ? FacetBase64.decode(input) : json ? FacetBase64.encodeJSON(input, field) : FacetBase64.encode(input);
      const check = json ? (field === null ? "JSON types preserved" : `Stored ${JSON.stringify(field)} as a JSON string`) : "Text round-trip matched";
      status("b64-status", decoding ? "Decoded" : "Verified", decoding ? `${result.bytes} bytes · ${result.encoding}` :
        `${result.bytes} UTF-8 bytes · ${check}`);
    } catch (e) { status("b64-status", decoding ? "Cannot decode" : "Cannot encode", e.message, true); }
    $("b64-output").textContent = result?.text ?? result?.base64 ?? "";
    $("copy-b64").disabled = $("to-json").disabled = !result;
  }
  function setCodecMode() {
    const mode = codecMode(), decoding = mode === "decode", json = mode === "json";
    const input = $("b64-input");
    input.value = codecDrafts[draftKey()];
    $("b64-field-label").hidden = !json;
    $("b64-format").hidden = !json;
    input.setAttribute("aria-label", decoding ? "Base64 input" : json ? "JSON input" : "Text to encode");
    input.placeholder = decoding ? "Paste Base64, Base64URL or a Base64 data URL…" :
      json ? "Paste any valid JSON value…" : "Paste text to encode as UTF-8…";
    $("b64-source-label").textContent = decoding ? "Encoded data" : json ? "JSON document" : "Plain text";
    $("b64-result-label").textContent = decoding ? "Readable text" : "Standard Base64";
    $("copy-b64").textContent = decoding ? "Copy text" : "Copy Base64";
    $("to-json").hidden = !decoding;
    $("b64-hint").textContent = decoding ? "UTF-8 and BOM-marked UTF-16 supported." :
      json ? "Leave the field blank to keep JSON types. Enter a top-level key only if its value must be a JSON string." : "Encodes the text as UTF-8 without adding JSON escapes.";
    updateBase64();
  }
  $("b64-mode").onchange = setCodecMode;
  $("b64-format").onclick = () => {
    try {
      const pretty = FacetJSON.format(FacetJSON.parse(codecDrafts.source).root, 2);
      if (pretty.length > FacetJSON.MAX_INPUT) throw Error("Formatted input exceeds the 1 Mi-character limit.");
      codecDrafts.source = pretty;
      $("b64-input").value = pretty;
      updateBase64();
    } catch (e) { notice(e.message); }
  };
  const queueBase64 = debounce(updateBase64);
  function queueCodecEdit() {
    $("b64-output").textContent = "";
    $("copy-b64").disabled = $("to-json").disabled = true;
    queueBase64();
  }
  $("b64-field").oninput = queueCodecEdit;
  $("b64-input").oninput = () => { codecDrafts[draftKey()] = $("b64-input").value; queueCodecEdit(); };
  $("b64-example").onclick = () => {
    const mode = codecMode();
    if (mode === "json") $("b64-field").value = "";
    codecDrafts[draftKey()] = mode === "decode" ? btoa('{"message":"Hello from Facet","local":true}') :
      mode === "json" ? JSON.stringify({ version: 1, payload: { tags: ["atlas", "local"] } }, null, 2) : "Hello from Facet!";
    setCodecMode();
  };
  $("b64-file").onclick = () => {
    const key = draftKey();
    chooseFile($("b64-input"), (_name, text) => {
      // Textareas normalize CRLF on assignment; keep the loaded text for encoding.
      codecDrafts[key] = text; setCodecMode();
    }, msg => {
      $("b64-output").textContent = "";
      $("copy-b64").disabled = $("to-json").disabled = true;
      status("b64-status", "File not opened", msg, true);
    });
  };
  $("copy-b64").onclick = () => copy($("b64-output").textContent);
  $("to-json").onclick = () => { $("json-input").value = $("b64-output").textContent; updateJSON(); location.hash = "json"; };
  diffSample(); $("json-input").value = imperfect; updateJSON(); $("b64-example").click(); navigate();
})();
