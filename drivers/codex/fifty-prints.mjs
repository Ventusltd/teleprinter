/** 25 scenarios, two fresh installed-Chrome visits each; all binary evidence stays offline. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { attachScreenCapture, clickAndReadDownload } from './driver.mjs';

const appRender = process.argv.includes('--app-render');
const here = path.dirname(fileURLToPath(import.meta.url));
const base = process.argv[2];
assert.ok(base, 'Usage: node fifty-prints.mjs BASE_URL [OFFLINE_ROOT] [--limit=25]');
const root = path.resolve(process.argv[3]?.startsWith('--') || !process.argv[3]
  ? 'C:/Users/vikra/OneDrive/Desktop/offline-screenshots' : process.argv[3]);
assert.ok(!root.toLowerCase().startsWith(path.resolve(here, '../..').toLowerCase()), 'Print artifacts must stay outside Git.');
const limit = Number(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || 25);
assert.ok(Number.isInteger(limit) && limit >= 1 && limit <= 25);
const offset = Number(process.argv.find(arg => arg.startsWith('--offset='))?.split('=')[1] || 0);
assert.ok(Number.isInteger(offset) && offset >= 0 && offset + limit <= 25);
const buildSha256 = process.argv.find(arg => arg.startsWith('--build-sha256='))?.split('=')[1];
assert.match(buildSha256 || '', /^[a-f0-9]{64}$/i, 'Supply --build-sha256=HASH for the frozen candidate build.');
async function readCandidateJSON(relative) {
  const response = await fetch(new URL(relative, base), { signal: AbortSignal.timeout(30000), cache: 'no-store' });
  assert.ok(response.ok, `${relative}: HTTP ${response.status}`);
  return response.json();
}
const release = await readCandidateJSON('release.json');
const pins = Object.fromEntries(await Promise.all(['atlas', 'pipeline', 'landing'].map(async app => [app, await readCandidateJSON(`teleprinter/${app}-source-pin.json`)])));
const sourceCommit = pins.atlas.commit;
assert.ok(Object.values(pins).every(pin => pin.commit === sourceCommit && pin.generation === release.generation), 'Source pins do not identify one frozen generation/commit.');
const candidate = { url: base, generation: release.generation, sourceCommit, engineCommit: release.teleprinter.commit, buildSha256 };
const output = path.join(root, `teleprinter-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`);
await fs.mkdir(output, { recursive: true });
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || 'C:/Users/vikra/OneDrive/Documents/GitHub/gridatlas-main-202609050200/node_modules/playwright/index.mjs').href);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const geometries = [
  { name: 'desktop-wide', width: 1440, height: 900, dpr: 1 },
  { name: 'desktop-portrait', width: 900, height: 1200, dpr: 1 },
  { name: 'iPad-emulation', width: 1024, height: 768, dpr: 2 },
  { name: 'iPhone-emulation', width: 393, height: 852, dpr: 2 },
  { name: 'mobile-landscape', width: 852, height: 393, dpr: 2 }
];
const projects = [
  { ref: '2484', query: 'repd_ref=2484&technology=wind_offshore&latitude=52.6199968&longitude=2.5499934' },
  { ref: '18790', query: 'repd_ref=18790&technology=bess' },
  { ref: '11613', query: 'repd_ref=11613&technology=wind_offshore' }
];
const pipelineSearches = ['Berwick', 'Ossian', 'Hornsea', 'Dogger', 'Norfolk', 'RWE', 'SSE', 'Orsted'];
const layerSets = [['400', '275'], ['220', '132', '66'], ['400', '220', '132'], ['275', '66'], ['400', '132', '66']];
const scenarios = Array.from({ length: 25 }, (_, i) => {
  const kind = i < 15 ? 'atlas' : i < 23 ? 'pipeline' : 'landing';
  const project = projects[i % projects.length];
  return { id: String(i + 1).padStart(2, '0'), kind, geometry: geometries[i % 5],
    route: kind === 'atlas' ? `atlas/?${project.query}` : kind === 'pipeline' ? 'pipeline/' : '',
    project: kind === 'atlas' ? project.ref : null, layers: kind === 'atlas' ? layerSets[i % 5] : [],
    search: kind === 'pipeline' ? pipelineSearches[i - 15] : null,
    pdfRoute: 'File > Print PDF' };
});
const receipt = { createdAt: new Date().toISOString(), base, candidate, output, browser: 'installed Chrome', printRoute:appRender?'app-render, no host capture':'host screenshot', physicalDevices: false,
  requestedScenarios: limit, expectedVisits: limit * 2, expectedDownloads: limit * 2, scenarios: [] };
const receiptPath = path.join(here, 'fifty-prints-results.json');
async function saveReceipt() { const text = JSON.stringify(receipt, null, 2) + '\n'; await fs.writeFile(receiptPath, text); await fs.writeFile(path.join(output, 'campaign-results.json'), text); }

async function readAtlasState(page) {
  return page.evaluate(() => {
    const rect = node => { const r = node?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null; };
    const onscreen = r => !!r && r.width > 0 && r.height > 0 && r.x < innerWidth && r.y < innerHeight && r.x + r.width > 0 && r.y + r.height > 0;
    const forms = [...document.querySelectorAll('input,textarea,select')];
    const controls = [...document.querySelectorAll('input[data-gridatlas-layer-proxy],input[data-layer-id]')]
      .filter(input => { const r = input.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(input).visibility !== 'hidden'; })
      .map(input => { const label = input.closest('label'); const bounds = rect(label); return {
        index: forms.indexOf(input), key: input.dataset.gridatlasLayerProxy || `engine:${input.dataset.layerId}`,
        checked: input.checked, label: (label?.textContent || input.getAttribute('aria-label') || '').trim(),
        bounds, intersectsViewport: onscreen(bounds)
      }; });
    const panel = ['scada-ui-container', 'fs-curtain-keys', 'gridatlas-dash'].map(id => document.getElementById(id)).find(node => onscreen(rect(node)));
    const panelBounds = rect(panel);
    const map = window.__GRIDATLAS_V9_MAP__;
    return { url: location.href, visibleText: document.body.innerText, controls,
      selectedLayerKeys: [...new Set(controls.filter(input => input.checked).map(input => input.key))].sort(),
      panel: { present: !!panel, bounds: panelBounds, intersectsViewport: onscreen(panelBounds) },
      mapLayers: (map?.getStyle?.()?.layers || []).map(layer => ({ id: layer.id, visibility: layer.layout?.visibility || 'visible' })) };
  });
}
function assertAtlasState(snapshot, scenario, expectedKeys) {
  assert.match(snapshot.visibleText, new RegExp(`TEST CODE repd-${scenario.project} \\| ENGINE COMPLETED`), 'Captured project engine status differs from the requested project.');
  assert.match(snapshot.visibleText, new RegExp(`REPD\\s+${scenario.project}\\b`), 'Captured project identity missing.');
  assert.deepEqual(snapshot.selectedLayerKeys, [...new Set(expectedKeys)].sort(), 'Layer selection changed before capture.');
  const selected = snapshot.controls.filter(input => input.checked);
  assert.ok(selected.length && selected.every(input => input.label), 'Selected layer legend labels must be nonempty.');
  assert.ok(snapshot.panel.intersectsViewport, 'Open Layers panel does not intersect the captured viewport.');
  assert.ok(selected.some(input => input.intersectsViewport), 'No selected layer legend label intersects the captured viewport.');
  for (const layer of scenario.layers) {
    const rendered = snapshot.mapLayers.find(item => item.id === `l-${layer}`);
    assert.ok(rendered, `Expected map layer l-${layer} is unavailable.`);
    assert.equal(rendered.visibility !== 'none', snapshot.selectedLayerKeys.includes(`engine:${layer}`), `Map layer ${layer} does not match its checkbox.`);
  }
}

async function prepare(page, scenario, progress) {
  progress('navigate');
  await page.goto(new URL(scenario.route, base).href, { waitUntil: 'domcontentloaded', timeout: 60000 });
  progress('wait for app print menus');
  await page.locator('#codex-teleprinter').waitFor({state:'attached', timeout:90000});
  const state = { url: page.url(), project: scenario.project, layers: [] };
  if (scenario.kind === 'atlas') {
    progress('wait for visible engine completion');
    const badge = page.getByText(new RegExp(`TEST CODE repd-${scenario.project} \\| ENGINE COMPLETED`)).first();
    await badge.waitFor({ state: 'visible', timeout: 90000 });
    state.engineStatus = await badge.innerText();
    const body = await page.locator('body').innerText();
    assert.match(body, new RegExp(`REPD\\s+${scenario.project}\\b`), 'Project identity missing from visible body.');
    assert.match(body, /Nearest|substation|connection/i, 'Project calculation missing from visible body.');
    state.projectBody = body;
    progress('wait for File menu and layers panel');
    await page.locator('.gm-title').filter({ hasText: /^File$/i }).waitFor({ state: 'visible', timeout: 60000 });
    const toggle = page.locator('#gridatlas-dash-toggle');
    if (!/HIDE LAYERS/i.test(await toggle.innerText())) await toggle.click();
    for (const layer of scenario.layers) {
      progress(`toggle layer ${layer}`);
      const input = page.locator(`input[data-gridatlas-layer-proxy="engine:${layer}"]:visible, input[data-layer-id="${layer}"]:visible`).first();
      await input.waitFor({ state: 'visible', timeout: 60000 });
      const before = await input.isChecked();
      await input.locator('xpath=ancestor::label[1]').click();
      assert.equal(await input.isChecked(), !before, `Layer ${layer} failed to toggle.`);
    }
    state.layers = await page.locator('input[data-gridatlas-layer-proxy]:visible, input[data-layer-id]:visible').evaluateAll(inputs =>
      inputs.filter(input => input.checked).map(input => ({ key: input.dataset.gridatlasLayerProxy || `engine:${input.dataset.layerId}`,
        label: input.getAttribute('aria-label') || input.parentElement.textContent.trim() })).sort((a, b) => a.key.localeCompare(b.key)));
    state.selectedLayerKeys = state.layers.map(layer => layer.key);
  } else if (scenario.kind === 'pipeline') {
    progress(`wait for Pipeline rows, search ${scenario.search}`);
    await page.waitForFunction(() => document.querySelector('#tbody tr')?.children.length > 1, null, {timeout:90000});
    await page.locator('#tbody tr td').first().waitFor({ state: 'visible', timeout: 30000 });
    await page.locator('#search').fill(scenario.search);
    await page.waitForFunction(query => {
      const row = document.querySelector('#tbody tr');
      return row?.children.length > 1 && row.innerText.toLowerCase().includes(query.toLowerCase());
    }, scenario.search, { timeout: 30000 });
    state.search = await page.locator('#search').inputValue();
    assert.equal(state.search, scenario.search);
    state.firstRow = await page.locator('#tbody tr').first().innerText();
    state.visibleResultCount = await page.locator('#tbody tr').count();
    assert.ok(state.visibleResultCount > 0, 'Pipeline search returned no visible project rows.');
    await page.waitForFunction(query => new URL(location.href).searchParams.get('q') === query, scenario.search, {timeout:30000});
  } else {
    state.bodyExcerpt = (await page.locator('body').innerText()).slice(0, 3000);
    assert.ok(state.bodyExcerpt.trim().length > 50, 'Landing body is empty.');
  }
  state.url = page.url();
  return state;
}

for (const scenario of scenarios.slice(offset, offset + limit)) {
  const result = { ...scenario, visits: [], pairStateMatches: false };
  receipt.scenarios.push(result);
  for (const mode of ['pdf', 'source']) {
    let browser, context, page, captured, captureStatePromise;
    const visit = { visitId: `${path.basename(output)}-${scenario.id}-${mode}`, browser: 'installed Chrome', candidate,
      mode, startedAt: new Date().toISOString(), ok: false, console: [], networkFailures: [] };
    result.visits.push(visit);
    let currentStep = 'launch Chrome';
    const progress = step => { currentStep = step; console.log(`STEP ${scenario.id} ${mode}: ${step}`); };
    const heartbeat = setInterval(() => console.log(`WAIT ${scenario.id} ${mode}: ${currentStep}`), 30000);
    try {
      progress('launch Chrome');
      browser = await chromium.launch({ channel: 'chrome', headless: true });
      const { width, height, dpr } = scenario.geometry;
      context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, acceptDownloads: true });
      page = await context.newPage();
      page.on('console', message => { if (['error', 'warning'].includes(message.type()) && visit.console.length < 150) visit.console.push({ type: message.type(), text: message.text() }); });
      page.on('pageerror', error => visit.console.push({ type: 'pageerror', text: String(error) }));
      page.on('requestfailed', request => { if (visit.networkFailures.length < 150) visit.networkFailures.push({ url: request.url(), error: request.failure()?.errorText }); });
      if (!appRender) await attachScreenCapture(page, { onCapture: png => {
        captured = png;
        // driver.mjs does not await onCapture: observe rejection immediately, await below.
        if (scenario.kind === 'atlas') captureStatePromise = readAtlasState(page).then(value => ({ value }), error => ({ error }));
      } });
      if(appRender) await page.addInitScript(()=>{window.__forbiddenPrintCalls=0;const forbid=()=>{window.__forbiddenPrintCalls++;throw Error('Forbidden screen/browser capture');};if(navigator.mediaDevices)navigator.mediaDevices.getDisplayMedia=forbid;window.print=forbid;window.__codexTeleprinterCapture=forbid;});
      visit.state = await prepare(page, scenario, progress);
      if(appRender)await page.evaluate(()=>document.querySelector('#codex-teleprinter').addEventListener('teleprint',e=>window.__appPrintReceipt=e.detail));
      let downloaded;
      if (mode === 'pdf') {
        progress(`download PDF via ${scenario.pdfRoute}`);
        if (scenario.kind === 'atlas') {
          await page.locator('.gm-title').filter({ hasText: /^File$/i }).click();
          downloaded = await clickAndReadDownload(page, page.locator('button[data-gm-export]').filter({ hasText: /Print/i }).first(), { timeout: 60000 });
        } else {
          await page.locator('#codex-teleprinter #file-menu > summary').click();
          downloaded = await clickAndReadDownload(page, page.locator('#codex-teleprinter [data-codex-print-command="pdf"]'), { timeout:60000 });
        }
        assert.ok(downloaded.ok, downloaded.error);
        visit.bytes = downloaded.bytes.length;
        visit.sha256 = sha256(downloaded.bytes);
        visit.suggestedFilename = downloaded.filename;
        if(appRender){
          visit.appReceipt=await page.evaluate(()=>window.__appPrintReceipt);
          assert.equal(visit.appReceipt.method,'app-render');
          assert.equal(await page.evaluate(()=>window.__forbiddenPrintCalls),0);
          captured=await page.screenshot({type:'png',scale:'device'});
          if(scenario.kind==='atlas')captureStatePromise=readAtlasState(page).then(value=>({value}));
        }
        assert.ok(captured, 'Missing independent viewport comparison.');
        if (scenario.kind === 'atlas') {
          assert.ok(captureStatePromise, 'Capture-time layer snapshot was not scheduled.');
          const snapshot = await captureStatePromise;
          if (snapshot.error) throw snapshot.error;
          visit.captureState = snapshot.value;
          assertAtlasState(visit.captureState, scenario, visit.state.selectedLayerKeys);
        }
        visit.path = path.join(output, `${scenario.id}-${scenario.kind}-${scenario.geometry.name}.pdf`);
        await fs.writeFile(visit.path, downloaded.bytes, { flag: 'wx' });
        visit.pngPath = visit.path.replace(/\.pdf$/, '.png');
        visit.pngSha256 = sha256(captured);
        await fs.writeFile(visit.pngPath, captured, { flag: 'wx' });
        progress('inspect embedded and rendered PDF pixels');
        const inspected = spawnSync('python', [path.join(here, appRender ? 'inspect-app-pdf.py' : 'inspect-pdf.py')], {
          input: JSON.stringify({ pdf: downloaded.bytes.toString('base64'), png: captured.toString('base64') }), encoding: 'utf8', maxBuffer: 2000000, timeout: 60000
        });
        assert.equal(inspected.status, 0, inspected.stderr || String(inspected.error));
        visit.inspection = JSON.parse(inspected.stdout);
      } else {
        progress('prepare source download through the app File menu');
        if (scenario.kind === 'atlas') {
          progress('download source through File > Print source code');
          await page.locator('.gm-title').filter({hasText:/^File$/i}).click();
          visit.sourceCommandState = await readAtlasState(page);
          assertAtlasState(visit.sourceCommandState, scenario, visit.state.selectedLayerKeys);
          downloaded = await clickAndReadDownload(page, page.locator('button[data-codex-print-source]'), { timeout: 120000 });
        } else {
          await page.locator('#codex-teleprinter #file-menu > summary').click();
          downloaded = await clickAndReadDownload(page, page.locator('#codex-teleprinter [data-codex-print-command="source"]'), { timeout:120000 });
        }
        assert.ok(downloaded.ok, downloaded.error);
        visit.bytes = downloaded.bytes.length;
        visit.sha256 = sha256(downloaded.bytes);
        visit.suggestedFilename = downloaded.filename;
        const source = downloaded.bytes.toString('utf8');
        visit.path = path.join(output, `${scenario.id}-${scenario.kind}-${scenario.geometry.name}-source.txt`);
        await fs.writeFile(visit.path, downloaded.bytes, { flag: 'wx' });
        assert.match(source, /PRINT SOURCE CODE/);
        assert.ok(source.length > 10000, 'Source print coverage unexpectedly small.');
        const framed = source.match(/===== BEGIN DIAGNOSTIC MANIFEST =====\r?\n([\s\S]*?)\r?\n===== END DIAGNOSTIC MANIFEST =====/);
        assert.ok(framed, 'Source print has no runtime diagnostic manifest.');
        const manifest = JSON.parse(framed[1]);
        progress(`verify runtime manifest (${manifest.counts?.resources ?? '?'} resources)`);
        visit.runtimeManifestPath = visit.path.replace(/\.txt$/, '-manifest.json');
        await fs.writeFile(visit.runtimeManifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
        visit.runtimeManifest = { format: manifest.format, complete: manifest.complete,
          observedResourcesComplete: manifest.observedResourcesComplete, counts: manifest.counts,
          failures: manifest.failures, discoveryWarnings: manifest.discoveryWarnings,
          state: { url: manifest.state?.url, viewport: manifest.state?.viewport },
          baseManifest: { commit: manifest.baseManifest?.commit, sha256: manifest.baseManifest?.sha256 } };
        assert.equal(manifest.state?.url, visit.state.url, 'Source capture URL differs from the actual app view.');
        if (scenario.kind === 'atlas') {
          const snapshot = visit.sourceCommandState;
          assert.match(manifest.state.visibleText, new RegExp(`TEST CODE repd-${scenario.project} \\| ENGINE COMPLETED`));
          assert.match(manifest.state.visibleText, new RegExp(`REPD\\s+${scenario.project}\\b`));
          for (const control of snapshot.controls) {
            const form = manifest.state.forms.find(form => form.root === 'document' && form.index === control.index);
            assert.ok(form && form.type === 'checkbox', `Source manifest missing layer form ${control.key}.`);
            assert.equal(form.checked, control.checked, `Source manifest layer ${control.key} differs from the printed view.`);
          }
          for (const layer of scenario.layers) {
            const mapLayer = manifest.state.map?.layers?.find(item => item.id === `l-${layer}`);
            assert.ok(mapLayer, `Source map is missing layer l-${layer}.`);
            assert.equal(mapLayer.layout?.visibility !== 'none', snapshot.selectedLayerKeys.includes(`engine:${layer}`));
          }
          for (const control of snapshot.controls.filter(input => input.checked && input.intersectsViewport)) {
            const legendName = control.label.replace(/\s*\[(?:OK|LOAD|WAIT|ERROR)\]/g, '').trim();
            assert.ok(manifest.state.visibleText.includes(legendName), `Source visible text is missing selected legend ${legendName}.`);
          }
          visit.sourceCapturedLayerKeys = [...new Set(snapshot.controls.filter(control => manifest.state.forms.find(form => form.root === 'document' && form.index === control.index)?.checked).map(control => control.key))].sort();
        }
        assert.equal(manifest.baseManifest?.commit, candidate.sourceCommit, 'Source capture commit differs from frozen candidate.');
        assert.equal(manifest.baseManifest?.sha256, pins[scenario.kind].sha256, 'Source capture bytes differ from the app source pin.');
        assert.equal(manifest.failures?.length, 0, 'Runtime source capture reports unavailable or failed resources; see saved manifest.');
      }
      visit.bytes = downloaded.bytes.length;
      visit.sha256 = sha256(downloaded.bytes);
      visit.suggestedFilename = downloaded.filename;
      visit.status = await page.locator('#codex-teleprinter #status').innerText().catch(() => '');
      visit.ok = true;
      console.log(`PASS ${scenario.id} ${mode} ${visit.bytes} bytes`);
    } catch (error) {
      visit.error = String(error);
      if (page) {
        const failure = { url: page.url(), body: await page.locator('body').innerText().catch(() => ''),
          dom: await page.content().catch(() => ''), console: visit.console, networkFailures: visit.networkFailures };
        const failureBytes = Buffer.from(JSON.stringify(failure, null, 2) + '\n');
        visit.failureEvidencePath = path.join(output, `${scenario.id}-${mode}-failure.json`);
        visit.failureEvidenceSha256 = sha256(failureBytes);
        await fs.writeFile(visit.failureEvidencePath, failureBytes, { flag: 'wx' });
        visit.status = await page.locator('#codex-teleprinter #status').innerText().catch(() => '');
      }
      console.log(`FAIL ${scenario.id} ${mode}: ${error.message}`);
    } finally {
      clearInterval(heartbeat);
      captured = undefined;
      await context?.close().catch(() => {});
      await browser?.close().catch(() => {});
      if (visit.failureEvidencePath) {
        visit.consoleCount = visit.console.length;
        visit.networkFailureCount = visit.networkFailures.length;
        delete visit.console;
        delete visit.networkFailures;
      }
      visit.closedAt = new Date().toISOString();
      visit.finishedAt = visit.closedAt;
      await saveReceipt();
    }
  }
  const [pdf, source] = result.visits;
  result.pairStateMatches = !!(pdf.state && source.state && pdf.state.url === source.state.url &&
    JSON.stringify(pdf.state.selectedLayerKeys || []) === JSON.stringify(source.state.selectedLayerKeys || []) &&
    pdf.state.project === source.state.project && pdf.state.search === source.state.search &&
    pdf.state.firstRow === source.state.firstRow && (scenario.kind !== 'atlas' ||
      JSON.stringify(pdf.captureState?.selectedLayerKeys) === JSON.stringify(source.sourceCapturedLayerKeys)));
  await saveReceipt();
}
receipt.finishedAt = new Date().toISOString();
receipt.actualVisits = receipt.scenarios.reduce((sum, scenario) => sum + scenario.visits.length, 0);
receipt.savedDownloads = receipt.scenarios.flatMap(scenario => scenario.visits).filter(visit => visit.path).length;
receipt.ok = receipt.scenarios.every(scenario => scenario.pairStateMatches && scenario.visits.every(visit => visit.ok));
await saveReceipt();
console.log(JSON.stringify({ ok: receipt.ok, visits: receipt.actualVisits, savedDownloads: receipt.savedDownloads, output, receiptPath }));
if (!receipt.ok) process.exitCode = 1;
