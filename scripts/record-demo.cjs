// Optional maintainer tool; the app itself has no dependencies.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright-core");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

async function main() {
  const dry = process.argv.includes("--dry-run");
  if (!process.env.DEMO_DIR) throw Error("Set DEMO_DIR to an output directory outside the source tree.");
  const out = path.resolve(process.env.DEMO_DIR);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || "msedge" });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(process.env.FACET_URL || pathToFileURL(path.resolve("index.html")).href);
    assert.equal(await page.evaluate(() => document.visibilityState), "visible");
    const pause = ms => page.waitForTimeout(dry ? 30 : ms);
    const chapter = async text => { if (!dry) await page.screencast.showChapter(text, { duration: 1500 }); };
    const button = name => page.getByRole("button", { name, exact: true });
    const nav = name => page.getByRole("link", { name });
    const example = region => page.getByRole("region", { name: region, exact: true })
      .getByRole("button", { name: "Load example", exact: true }).click();
    await example("Compare workspace");
    if (!dry) await page.screencast.start({ path: path.join(out, "facet-walkthrough.webm"), size: { width: 1280, height: 800 } });
    try {
      if (!dry) await page.screencast.showActions();
      await chapter("01  /  Trace a matching block");
      const engine = page.locator('#rows0 .row').filter({ hasText: '"engine"' });
      await engine.hover();
      assert.equal(await page.locator(".row.linked").count(), 2);
      assert.ok(await page.locator("#bridge").getAttribute("d"));
      assert.match(await page.locator("#rows1 .linked").innerText(), /"engine"/);
      if (dry) await page.screenshot({ path: path.join(out, "facet-preview.png") });
      await pause(2300);
      await page.locator("#rows0 .row").filter({ hasText: '"channels"' }).hover();
      assert.match(await page.locator("#rows1 .linked").innerText(), /"channels"/);
      await pause(1900);
      await page.getByRole("checkbox", { name: "Ordered arrays" }).check();
      assert.match(await page.locator("#diff-status").innerText(), /3 changed/);
      await pause(1600);
      await chapter("02  /  Repair a document");
      await nav(/JSON Studio/).click();
      await example("JSON Studio");
      assert.match(await page.locator("#json-status").innerText(), /Repaired/i);
      await pause(1600);
      await button("Collapse all").click();
      assert.equal(await page.locator("#json-output details[open]").count(), 0);
      await pause(850);
      await button("Expand all").click();
      await pause(900);
      await button("Text").click();
      await button("Open expanded JSON output").click();
      assert.deepEqual(JSON.parse(await page.locator("#viewer-body").innerText()).channels, ["web", "cli"]);
      await pause(2000);
      await button("Close").click();
      await chapter("03  /  Decode and keep working");
      await nav(/Base64/).click();
      await example("Base64 codec");
      assert.equal(JSON.parse(await page.locator("#b64-output").innerText()).message, "Hello from Facet");
      await pause(2100);
      await button("Open in JSON Studio →").click();
      await button("Tree").click();
      assert.match(await page.locator("#json-status").innerText(), /Valid JSON/i);
      assert.match(await page.locator("#json-output").innerText(), /Hello from Facet/);
      await pause(2300);
      assert.deepEqual(errors, []);
      console.log(dry ? "Dry run passed: all three chapters and peer links verified." : "Recorded: all three chapters passed.");
    } finally { if (!dry) await page.screencast.stop(); }
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
