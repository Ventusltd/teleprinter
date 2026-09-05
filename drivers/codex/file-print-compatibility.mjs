/** Six fresh non-Chrome visits, actual separate File print commands. Offline artifacts only. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { attachScreenCapture, clickAndReadDownload } from './driver.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const base = process.argv[2] || 'https://globalgrid2050.com/testcode/202609051457/';
const output = path.join('C:/Users/vikra/OneDrive/Desktop/offline-screenshots', `file-print-compatibility-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await fs.mkdir(output, { recursive: true });
const { chromium, firefox, webkit } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || 'C:/Users/vikra/OneDrive/Documents/GitHub/gridatlas-main-202609050200/node_modules/playwright/index.mjs').href);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const report = { base, output, startedAt: new Date().toISOString(), physicalSafariOrIPhoneTested: false,
  screenshotChooserCovered: false, captureMethod: 'Playwright viewport capture binding', visits: [] };
const reportPath = path.join(here, 'file-print-compatibility-results.json');
const retryFirefoxSource = process.argv.includes('--retry-firefox-source');
if (retryFirefoxSource) {
  const original = JSON.parse(await fs.readFile(reportPath, 'utf8'));
  assert.equal(original.base, base, 'Retry must use the original candidate.');
  report.visits = original.visits;
  report.initialStartedAt = original.startedAt;
  report.originalOutput = original.output;
  report.retry = 'One bounded Firefox source retry; original failures retained.';
}
for (const [name, type, options, viewport, deviceScaleFactor] of [
  ['Edge', chromium, { channel: 'msedge' }, { width: 1440, height: 900 }, 1],
  ['Firefox', firefox, {}, { width: 393, height: 852 }, 2],
  ['WebKit', webkit, {}, { width: 1024, height: 768 }, 2]
]) {
  for (const mode of ['pdf', 'source']) {
    if (retryFirefoxSource && (name !== 'Firefox' || mode !== 'source')) continue;
    const visit = { browser: name, mode, viewport, deviceScaleFactor, startedAt: new Date().toISOString(), ok: false };
    report.visits.push(visit);
    let browser, context, page, png, step = 'launch';
    const errors = [];
    const progress = value => { step = value; console.log(`STEP ${name} ${mode}: ${step}`); };
    const heartbeat = setInterval(() => console.log(`WAIT ${name} ${mode}: ${step}`), 30000);
    try {
      browser = await type.launch({ headless: true, ...options });
      context = await browser.newContext({ viewport, deviceScaleFactor, acceptDownloads: true });
      page = await context.newPage();
      page.on('pageerror', error => errors.push({ type: 'pageerror', text: String(error) }));
      page.on('requestfailed', request => { if (errors.length < 150) errors.push({ type: 'requestfailed', url: request.url(), reason: request.failure()?.errorText }); });
      await attachScreenCapture(page, { onCapture: captured => { png = captured; } });
      progress('navigate and await computed project');
      await page.goto(new URL('atlas/?repd_ref=2484&technology=wind_offshore&latitude=52.6199968&longitude=2.5499934', base).href, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.getByText(/TEST CODE .*\| ENGINE COMPLETED/).first().waitFor({ state: 'visible', timeout: 90000 });
      assert.match(await page.locator('body').innerText(), /REPD\s+2484\b/);
      visit.url = page.url();
      visit.engineStatus = await page.getByText(/TEST CODE .*\| ENGINE COMPLETED/).first().innerText();
      const fileMenu = page.locator('.gm-title').filter({ hasText: /^File$/i });
      await fileMenu.waitFor({ state: 'visible', timeout: 60000 });
      const toggle = page.locator('#gridatlas-dash-toggle');
      if (!/HIDE LAYERS/i.test(await toggle.innerText())) await toggle.click();
      for (const layer of ['400', '275']) {
        progress(`select layer ${layer}`);
        const input = page.locator(`input[data-gridatlas-layer-proxy="engine:${layer}"]:visible, input[data-layer-id="${layer}"]:visible`).first();
        await input.waitFor({ state: 'visible', timeout: 60000 });
        await input.locator('xpath=ancestor::label[1]').click();
        assert.equal(await input.isChecked(), true);
      }
      visit.selectedLayerKeys = await page.locator('input[data-layer-id]:visible, input[data-gridatlas-layer-proxy]:visible').evaluateAll(inputs => inputs.filter(input => input.checked).map(input => input.dataset.gridatlasLayerProxy || `engine:${input.dataset.layerId}`).sort());
      await fileMenu.click();
      progress(`File > ${mode === 'pdf' ? 'Print' : 'Print source code'}`);
      const command = mode === 'pdf'
        ? page.locator('button[data-gm-export]').filter({ hasText: /Print/i }).first()
        : page.locator('button[data-codex-print-source]').first();
      const download = await clickAndReadDownload(page, command, { timeout: mode === 'pdf' ? 60000 : 120000 });
      assert.ok(download.ok, download.error);
      visit.path = path.join(output, `${name}-${mode}.${mode === 'pdf' ? 'pdf' : 'txt'}`);
      visit.bytes = download.bytes.length;
      visit.sha256 = sha256(download.bytes);
      await fs.writeFile(visit.path, download.bytes, { flag: 'wx' });
      if (mode === 'pdf') {
        assert.ok(png, 'App File Print did not invoke host capture.');
        visit.pngPath = path.join(output, `${name}-pdf.png`);
        visit.pngSha256 = sha256(png);
        await fs.writeFile(visit.pngPath, png, { flag: 'wx' });
        progress('inspect PDF image pixels and furniture');
        const inspected = spawnSync('python', [path.join(here, 'inspect-pdf.py')], { input: JSON.stringify({ pdf: download.bytes.toString('base64'), png: png.toString('base64') }), encoding: 'utf8', maxBuffer: 2000000, timeout: 60000 });
        assert.equal(inspected.status, 0, inspected.stderr);
        visit.inspection = JSON.parse(inspected.stdout);
        assert.ok(visit.inspection.headersFootersPresent);
      } else {
        const match = download.bytes.toString('utf8').match(/===== BEGIN DIAGNOSTIC MANIFEST =====\r?\n([\s\S]*?)\r?\n===== END DIAGNOSTIC MANIFEST =====/);
        assert.ok(match, 'No runtime diagnostic manifest in File source download.');
        const manifest = JSON.parse(match[1]);
        visit.manifest = { format: manifest.format, counts: manifest.counts, complete: manifest.complete, observedResourcesComplete: manifest.observedResourcesComplete, failures: manifest.failures, sourceCommit: manifest.baseManifest?.commit, stateUrl: manifest.state?.url };
        assert.equal(manifest.state?.url, visit.url);
        assert.equal(manifest.failures?.length, 0, 'Source capture has failed resources.');
      }
      visit.ok = true;
      console.log(`PASS ${name} ${mode}: ${visit.bytes} bytes`);
    } catch (error) {
      visit.error = String(error);
      const evidence = Buffer.from(JSON.stringify({ errors, body: await page?.locator('body').innerText().catch(() => ''), dom: await page?.content().catch(() => '') }, null, 2));
      visit.failurePath = path.join(output, `${name}-${mode}-failure.json`);
      visit.failureSha256 = sha256(evidence);
      await fs.writeFile(visit.failurePath, evidence, { flag: 'wx' });
      console.log(`FAIL ${name} ${mode}: ${error.message}`);
    } finally {
      clearInterval(heartbeat); png = undefined;
      await context?.close().catch(() => {});
      await browser?.close().catch(() => {});
      visit.finishedAt = new Date().toISOString();
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
    }
  }
}
report.finishedAt = new Date().toISOString();
report.ok = report.visits.length === 6 && report.visits.every(visit => visit.ok);
await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ok: report.ok, reportPath, output }));
if (!report.ok) process.exitCode = 1;
