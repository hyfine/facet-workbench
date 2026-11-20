const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright-core");
const { createServer } = require("node:http");
const { pathToFileURL } = require("node:url");
const fs = require("node:fs/promises");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

async function exercise(page, url) {
  const errors = [], external = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("request", r => {
    if (/^https?:/.test(r.url()) && new URL(r.url()).origin !== new URL(url).origin) external.push(r.url());
  });
  await page.goto(url);
  const button = name => page.getByRole("button", { name, exact: true });
  const row = page.locator("#rows0 .row").filter({ hasText: '"engine"' });
  await row.hover();
  assert.match(await page.locator("#rows1 .linked").innerText(), /"engine"/);
  assert.ok(await page.locator("#bridge").getAttribute("d"));
  await button("Edit inputs").click();
  await page.getByRole("textbox", { name: "Original text" }).fill('{"a":[2,1],"b":{"nested":true}}');
  await page.getByRole("textbox", { name: "Revision text" }).fill('{"b":{"nested":true},"a":[1,2]}');
  await button("Compare now").click();
  assert.match(await page.locator("#diff-status").innerText(), /Identical/);
  await page.getByLabel("Ordered arrays").check();
  assert.match(await page.locator("#diff-status").innerText(), /2 changed/);
  await page.getByRole("combobox", { name: "Mode", exact: true }).selectOption("text");
  for (const [label, name, text] of [
    ["Open original file", "before.txt", "draft\nkeep\nend"],
    ["Open revision file", "after.txt", "final\nkeep\nend\nextra"]
  ]) {
    const chooser = page.waitForEvent("filechooser");
    await button(label).click();
    await (await chooser).setFiles({ name, mimeType: "text/plain", buffer: Buffer.from(text) });
    await page.getByText(name, { exact: true }).waitFor();
  }
  assert.match(await page.locator("#diff-status").innerText(), /1 changed/);
  assert.equal(await page.locator("#rows1 .added").count(), 1);
  await page.locator("#rows0 .row").first().focus();
  await page.keyboard.press("ArrowDown");
  assert.match(await page.locator("#rows1 .linked").innerText(), /keep/);
  await page.getByRole("link", { name: /JSON Studio/ }).click();
  const source = page.getByLabel("JSON source");
  await source.fill("{ value: 9007199254740993, }");
  await page.locator("#json-status").getByText("Repaired", { exact: true }).waitFor();
  await button("Text").click();
  assert.match(await page.locator("#json-output").innerText(), /9007199254740993/);
  assert.equal(await source.inputValue(), "{ value: 9007199254740993, }");
  await page.getByLabel("Auto-repair").uncheck();
  await page.locator("#json-status").getByText("Invalid JSON", { exact: true }).waitFor();
  assert.equal(await button("Save JSON").isDisabled(), true);
  await page.getByLabel("Auto-repair").check();
  const download = page.waitForEvent("download");
  await button("Save JSON").click();
  const saved = await download;
  assert.equal(saved.suggestedFilename(), "formatted.json");
  assert.match(await fs.readFile(await saved.path(), "utf8"), /"value": 9007199254740993/);
  const nested = { path: "C:\\archive\\daily", note: 'line one\nline "two"', log: 'Read "daily".\n'.repeat(8000) };
  const raw = JSON.stringify({ envelope: JSON.stringify(nested) });
  await source.fill(raw);
  await page.getByText(/Unpacked JSON strings: 1/).waitFor();
  const output = page.locator("#json-output");
  assert.deepEqual(JSON.parse(await output.innerText()), { envelope: nested });
  const unpackedDownload = page.waitForEvent("download");
  await button("Save JSON").click();
  assert.deepEqual(JSON.parse(await fs.readFile(await (await unpackedDownload).path(), "utf8")), { envelope: nested });
  await page.getByLabel("Unpack JSON strings").uncheck();
  assert.equal(JSON.parse(await output.innerText()).envelope, JSON.stringify(nested));
  await page.getByLabel("Unpack JSON strings").check();
  await button("Tree").click();
  assert.ok((await output.textContent()).includes(nested.note));
  assert.equal(await source.inputValue(), raw);
  const tools = page.getByRole("group", { name: "Workspace display" });
  const font = loc => loc.evaluate(e => parseFloat(getComputedStyle(e).fontSize));
  const initial = await font(output);
  await tools.getByRole("button", { name: "Zoom in" }).click();
  assert.equal(await font(output), initial * 1.25);
  await tools.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await page.waitForFunction(() => document.fullscreenElement?.id === "workspace");
  assert.ok(await output.evaluate(e => e.clientHeight > innerHeight / 2));
  await button("Open expanded JSON output").click();
  const viewer = page.getByRole("dialog");
  assert.equal(await font(page.locator("#viewer-body")), initial * 1.25);
  await viewer.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await page.waitForFunction(() => document.fullscreenElement?.id === "viewer-panel");
  await viewer.getByRole("button", { name: "Reset content zoom" }).click();
  assert.equal(await font(page.locator("#viewer-body")), initial);
  await viewer.getByRole("button", { name: "Exit fullscreen" }).click();
  await button("Close").click();
  if (await tools.getByRole("button", { name: "Exit fullscreen" }).count())
    await tools.getByRole("button", { name: "Exit fullscreen" }).click();
  await page.waitForFunction(() => !document.fullscreenElement);
  // Browsers and embeddings that disallow the native API can still fill the tab.
  await page.evaluate(() => { Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: false }); });
  await tools.getByRole("button", { name: "Fullscreen", exact: true }).click();
  assert.ok(await page.locator("#workspace").evaluate(e => e.clientWidth >= innerWidth - 1));
  await page.keyboard.press("Escape");
  await tools.getByRole("button", { name: "Fullscreen", exact: true }).waitFor();
  await page.evaluate(() => { delete document.fullscreenEnabled; });
  assert.equal(await source.inputValue(), raw);
  await page.getByRole("link", { name: /Base64/ }).click();
  await page.getByLabel("Base64 input").fill("AAAA");
  await page.locator("#b64-status").getByText("Cannot decode", { exact: true }).waitFor();
  assert.equal(await button("Open in JSON Studio →").isDisabled(), true);
  await page.getByLabel("Base64 input").fill(Buffer.from('{"hello":"世界"}').toString("base64url"));
  await button("Open in JSON Studio →").click();
  assert.equal(await source.inputValue(), '{"hello":"世界"}');
  await page.getByRole("link", { name: /Base64/ }).click();
  const codec = page.getByRole("region", { name: "Base64 codec" });
  const mode = codec.getByRole("combobox");
  const encoded = codec.locator("#b64-output");
  await mode.selectOption("encode");
  const text = "标题 🌿\r\n" + '"'.repeat(2);
  const picker = page.waitForEvent("filechooser");
  await codec.getByRole("button", { name: "Open file" }).click();
  await (await picker).setFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from(text) });
  await codec.getByText("Verified", { exact: true }).waitFor();
  assert.equal(await encoded.textContent(), Buffer.from(text).toString("base64"));
  await mode.selectOption("turnn");
  await codec.getByText("Cannot encode", { exact: true }).waitFor();
  const envelope = JSON.stringify({ TurnN: { prompt: text } }, null, 2);
  await codec.getByLabel("TurnN JSON input").fill(envelope);
  await codec.getByText("Verified", { exact: true }).waitFor();
  const packed = await encoded.textContent();
  const recovered = JSON.parse(Buffer.from(packed, "base64").toString("utf8"));
  assert.equal(typeof recovered.TurnN, "string");
  assert.equal(JSON.parse(recovered.TurnN).prompt, text);
  await codec.getByLabel("TurnN JSON input").fill("{}");
  await codec.getByText("Cannot encode", { exact: true }).waitFor();
  assert.equal(await encoded.textContent(), "");
  assert.equal(await button("Copy patch value").isDisabled(), true);
  await mode.selectOption("decode");
  await page.getByLabel("Base64 input").fill(packed);
  await button("Open in JSON Studio →").click();
  await page.getByText(/Unpacked JSON strings: 1/).waitFor();
  await button("Text").click();
  assert.deepEqual(JSON.parse(await output.innerText()), JSON.parse(envelope));
  await page.setViewportSize({ width: 375, height: 812 });
  for (const name of [/JSON Studio/, /Compare/, /Base64/]) {
    await page.getByRole("link", { name }).click();
    await page.waitForFunction(() => document.querySelector("a[aria-current=page]").hash === location.hash);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log("PASS", new URL(url).protocol, "paste, upload, semantic diff, keyboard mapping, repair, export, decode, handoff and mobile layout");
}

async function main() {
  const files = ["index.html", ...(await fs.readdir(path.join(root, "assets"))).map(n => "assets/" + n)];
  const types = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
  const server = createServer(async (req, res) => {
    const file = files.find(f => req.url === "/facet/" + f);
    if (!file) { res.writeHead(404).end(); return; }
    try { res.writeHead(200, { "content-type": types[path.extname(file)] }).end(await fs.readFile(path.join(root, file))); }
    catch (e) { res.destroy(e); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || "msedge" });
    for (const url of [pathToFileURL(path.join(root, "index.html")).href, `http://127.0.0.1:${server.address().port}/facet/index.html`]) {
      const ctx = await browser.newContext({ offline: url.startsWith("file:"), viewport: { width: 1280, height: 800 } });
      try { await exercise(await ctx.newPage(), url); } finally { await ctx.close(); }
    }
    const page = await browser.newPage();
    await page.goto(pathToFileURL(path.join(root, "docs", "demo.html")).href);
    await page.waitForFunction(() => document.querySelector("video").readyState >= 1);
    const result = await page.locator("video").evaluate(async v => {
      v.muted = true; v.playbackRate = 8;
      const ended = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error("Video did not play to the end.")), 30000);
        v.onended = () => { clearTimeout(timer); resolve(); };
        v.onerror = () => { clearTimeout(timer); reject(Error("Video decode failed.")); };
      });
      await v.play(); await ended;
      return { duration: v.currentTime, width: v.videoWidth, height: v.videoHeight };
    });
    assert.ok(result.duration > 10 && result.duration < 60);
    assert.deepEqual([result.width, result.height], [1280, 800]);
    console.log("PASS actual demo playback:", result);
  } finally { if (browser) await browser.close(); server.closeAllConnections(); server.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
