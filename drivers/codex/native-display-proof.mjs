/** Real Chrome display-capture flow. No host screenshot provider or replacement pixels. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { clickAndReadDownload } from './driver.mjs';

const args = process.argv.slice(2);
const options = {};
while (args.length) { const key = args.shift(); if (!key.startsWith('--') || !args.length) throw new Error('Use --name value options.'); options[key.slice(2)] = args.shift(); }
const base = new URL(options.base || 'http://127.0.0.2:8887/testcode/202609051517/');
const folderName = `native-display-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}`;
const output = path.resolve(options.output || path.join(process.env.USERPROFILE || process.cwd(), 'OneDrive/Desktop/offline-screenshots', folderName));
const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(root, '../..');
if (output === repo || output.startsWith(repo + path.sep)) throw new Error('Native proof artifacts must be stored outside the Git repository.');
await fs.mkdir(output, { recursive: false });
const modulePath = options.playwright || process.env.PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE || '', 'OneDrive/Documents/GitHub/globalgrid2050/uk_renewables_pipeline/v9.7/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(modulePath).href);
const flags = ['--auto-select-desktop-capture-source=Entire screen', '--allow-http-screen-capture', '--auto-accept-this-tab-capture'];
const servedEngineUrl = new URL('teleprinter/print-screen.js', base).href;
const servedEngineResponse = await fetch(servedEngineUrl);
assert.ok(servedEngineResponse.ok, 'Cannot read served screen engine');
const servedEngineSha256 = createHash('sha256').update(Buffer.from(await servedEngineResponse.arrayBuffer())).digest('hex');
const cases = [
  { id: 'atlas-desktop', app: 'atlas', width: 1365, height: 900, dpr: 1, mobile: false },
  { id: 'atlas-mobile-portrait', app: 'atlas', width: 393, height: 852, dpr: 3, mobile: true },
  { id: 'pipeline-landscape', app: 'pipeline', width: 1200, height: 800, dpr: 1, mobile: false },
];
const inspector = `import sys,json,base64,io
from pypdf import PdfReader
import pymupdf
p=json.load(sys.stdin); data=base64.b64decode(p['pdf']); settings=p['settings']; initial=p['initial']; drawing=p['drawing']
r=PdfReader(io.BytesIO(data),strict=True); assert len(r.pages)==1, 'expected one page'
page=r.pages[0]; objects=page['/Resources']['/XObject']; assert len(objects)==1, 'expected one screen image'
ref=next(iter(objects.values())); image=ref.get_object(); width=int(image['/Width']); height=int(image['/Height'])
assert width==settings['width'] and height==settings['height'], 'PDF pixels differ from native track settings'
assert width==drawing['width'] and height==drawing['height'], 'PDF pixels differ from actual drawn source dimensions'
rgb=image.get_data(); assert len(rgb)==width*height*3, 'invalid RGB payload size'
assert any(rgb), 'native captured RGB is entirely zero'
assert float(page.mediabox.width)==width, 'page width changed image width'
doc=pymupdf.open(stream=data,filetype='pdf'); rectangles=doc[0].get_image_rects(ref.idnum); assert len(rectangles)==1
rect=rectangles[0]; assert rect.x0==0 and rect.width==width and rect.height==height, 'screen image scaled/cropped'
header=float(rect.y0); footer=float(page.mediabox.height)-float(rect.y1)
assert header>0 and footer>0, 'header/footer bands must be outside the screen image'
content=page.get_contents().get_data().decode('latin1'); assert f'{width} 0 0 {height} 0 ' in content
text=page.extract_text(); assert 'GLOBALGRID2050' in text and 'generation' in text, 'header/footer text missing'
print(json.dumps({'imageWidth':width,'imageHeight':height,'pageWidth':float(page.mediabox.width),'pageHeight':float(page.mediabox.height),'headerHeight':header,'footerHeight':footer,'rgbBytes':len(rgb),'nonzeroRgb':True,'imageUnscaled':True,'validPdf':True,'furnitureOutsideImage':True,'initialSettingsGeometryMatch':width==initial['width'] and height==initial['height'],'drawTimeSettingsGeometryMatch':True,'actualDrawnSourceGeometryMatch':True}))
`;
const report = {
  startedAt: new Date().toISOString(), base: base.href, offlineArtifacts: output,
  scope: 'Real native getDisplayMedia call, initial and draw-time browser-provided track settings, actual drawn frame and PDF geometry, nonzero RGB, external header/footer bands, and stopped tracks.',
  limitations: ['Post-download screenshots are visual context only and are NOT pixel-equality references.', 'This does not prove original monitor physical resolution or exact source-frame color/pixel fidelity.', 'Mobile portrait is desktop Chrome emulation, not physical iPhone/Safari.', 'Writer byte/pixel retention is measured by separate unit and host-capture tests.'],
  originalGetDisplayMediaDelegated: true, hostScreenshotCaptureProvider: false, flags, cases: [],
  chooserAutomation: 'Chrome auto-select/auto-accept flags automate the native chooser only; getDisplayMedia and returned track/frame data remain original browser implementations.',
  temporaryEngineOverride: options['print-screen'] ? path.resolve(options['print-screen']) : null,
  servedEngineUrl, servedEngineSha256,
};
for (const specimen of cases) {
  let browser, context, page;
  const result = { ...specimen, ok: false };
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: flags });
    result.browserVersion = browser.version();
    context = await browser.newContext({ viewport: { width: specimen.width, height: specimen.height }, deviceScaleFactor: specimen.dpr, isMobile: specimen.mobile, hasTouch: specimen.mobile, acceptDownloads: true });
    if (options['print-screen']) {
      const engineBytes = await fs.readFile(path.resolve(options['print-screen']));
      result.temporaryEngineSha256 = createHash('sha256').update(engineBytes).digest('hex');
      await context.route('**/teleprinter/print-screen.js', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: engineBytes }));
    }
    await context.addInitScript(() => {
      const proof = { calls: [], tracks: [], draws: [], unavailable: false };
      window.__nativeDisplayProof = proof;
      const originalDraw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function(...args) {
        if (proof.tracks.some(track => track.kind === 'video' && track.readyState === 'live')) {
          const source = args[0];
          if (source instanceof HTMLVideoElement || source instanceof ImageBitmap) proof.draws.push({ instrument: source.constructor.name, width: source.videoWidth || source.width, height: source.videoHeight || source.height, arguments: args.slice(1), trackSettings: proof.tracks.filter(track => track.kind === 'video').map(track => track.getSettings()), delegatedToOriginal: true });
        }
        return originalDraw.apply(this, args);
      };
      const media = navigator.mediaDevices;
      if (!media?.getDisplayMedia) { proof.unavailable = true; return; }
      const original = media.getDisplayMedia.bind(media);
      media.getDisplayMedia = async (...args) => {
        const call = { startedAt: new Date().toISOString(), arguments: args, delegatedToOriginal: true };
        proof.calls.push(call);
        try {
          const stream = await original(...args);
          const videoTracks = stream.getVideoTracks();
          proof.tracks.push(...stream.getTracks());
          call.trackReceivedAt = new Date().toISOString();
          for (const track of stream.getTracks()) {
            const originalStop = track.stop.bind(track);
            track.stop = (...stopArgs) => {
              if (!call.firstTrackStoppedAt) call.firstTrackStoppedAt = new Date().toISOString();
              return originalStop(...stopArgs);
            };
          }
          call.videoTracks = videoTracks.map(track => ({ label: track.label, readyState: track.readyState, settings: track.getSettings() }));
          return stream;
        } catch (error) { call.error = String(error); throw error; }
      };
    });
    page = await context.newPage();
    const moduleResponse = page.waitForResponse(response => response.url() === servedEngineUrl, {timeout:60000})
      .then(async response => ({ sha256:createHash('sha256').update(await response.body()).digest('hex') })).catch(error => ({error:String(error)}));
    const url = new URL(`${specimen.app}/`, base);
    result.url = url.href;
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
    result.actualEngineResponse = await moduleResponse;
    assert.equal(result.actualEngineResponse.sha256, result.temporaryEngineSha256 || servedEngineSha256, 'Browser engine response does not match measured bytes');
    if (specimen.app === 'atlas') {
      await page.waitForFunction(() => window.__GRIDATLAS_V9_MAP__?.getStyle?.()?.layers?.length > 0, null, { timeout: 90000 });
      await page.locator('#codex-teleprinter').waitFor({ state: 'attached', timeout: 90000 });
    } else await page.locator('#codex-teleprinter #file-menu > summary').waitFor({ state: 'visible', timeout: 60000 });
    assert.equal(await page.evaluate(() => typeof window.__codexTeleprinterCapture), 'undefined', 'host screenshot provider must not be installed');
    await page.evaluate(() => document.querySelector('#codex-teleprinter').addEventListener('teleprint', event => { window.__nativeDisplayProof.receipt = event.detail; }));
    let locator;
    if (specimen.app === 'atlas') {
      const file = page.getByRole('button', { name: 'File', exact: true });
      await file.click();
      locator = page.locator('button[data-gm-export]').filter({ hasText: /\bPrint\b/i });
    } else {
      await page.locator('#codex-teleprinter #file-menu > summary').click();
      locator = page.locator('#codex-teleprinter [data-codex-print-command="pdf"]');
    }
    const download = await clickAndReadDownload(page, locator, { timeout: 45000 });
    const proof = await page.evaluate(() => {
      const proof = window.__nativeDisplayProof;
      return { unavailable: proof?.unavailable, calls: proof?.calls, draws: proof?.draws, receipt: proof?.receipt, tracks: proof?.tracks.map(track => ({ kind: track.kind, label: track.label, readyState: track.readyState, settings: track.getSettings() })), hostCaptureProvider: typeof window.__codexTeleprinterCapture };
    });
    result.nativeCapture = proof;
    assert.ok(download.ok, download.error);
    assert.equal(proof.calls.length, 1, 'expected exactly one native screen capture request');
    assert.equal(proof.calls[0].delegatedToOriginal, true);
    assert.ok(proof.tracks.length > 0 && proof.tracks.every(track => track.readyState === 'ended'), 'native capture tracks must stop after download');
    const initial = proof.calls[0].videoTracks[0]?.settings;
    const drawing = proof.draws.at(-1);
    assert.ok(drawing?.delegatedToOriginal, 'actual native frame draw must be observed without substitution');
    const settings = drawing.trackSettings[0];
    assert.ok(Number.isInteger(settings?.width) && settings.width > 0 && Number.isInteger(settings?.height) && settings.height > 0, 'native track must report actual dimensions');
    const pdfPath = path.join(output, `${specimen.id}.pdf`);
    await fs.writeFile(pdfPath, download.bytes, { flag: 'wx' });
    result.pdf = pdfPath;
    result.pdfBytes = download.bytes.length;
    result.sha256 = createHash('sha256').update(download.bytes).digest('hex');
    result.postDownloadScreenshot = path.join(output, `${specimen.id}-post-download.png`);
    await page.screenshot({ path: result.postDownloadScreenshot, fullPage: false, scale: 'device' });
    const inspected = spawnSync('python', ['-c', inspector], { input: JSON.stringify({ pdf: download.bytes.toString('base64'), settings, initial, drawing }), encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, windowsHide: true });
    assert.equal(inspected.status, 0, inspected.stderr);
    result.pdfInspection = JSON.parse(inspected.stdout);
    result.initialSettingsGeometryAssertion = { passed: result.pdfInspection.initialSettingsGeometryMatch, initial: { width: initial.width, height: initial.height }, drawn: { width: drawing.width, height: drawing.height }, explanation: 'Initial settings can change before a frame arrives. A mismatch remains recorded; it is not evidence of physical screen-resolution preservation.' };
    result.requestedViewportGeometryMatch = settings.width === Math.round(specimen.width * specimen.dpr) && settings.height === Math.round(specimen.height * specimen.dpr);
    result.ok = true;
    console.log(`PASS ${specimen.id}: native ${settings.width}x${settings.height}; tracks ended; PDF geometry retained.`);
  } catch (error) {
    result.error = String(error.stack || error);
    if (page) result.failureState = await page.evaluate(() => ({ title: document.title, url: location.href, status: document.querySelector('#codex-teleprinter')?.shadowRoot?.querySelector('#status')?.textContent, calls: window.__nativeDisplayProof?.calls, tracks: window.__nativeDisplayProof?.tracks.map(track => ({ readyState: track.readyState, settings: track.getSettings() })) })).catch(() => null);
    console.log(`FAIL ${specimen.id}: ${error.message}`);
  } finally {
    if (page) await page.evaluate(() => window.__nativeDisplayProof?.tracks.forEach(track => track.stop())).catch(() => {});
    await context?.close().catch(error => { result.cleanupError = String(error); result.ok = false; });
    await browser?.close().catch(error => { result.cleanupError = String(error); result.ok = false; });
    report.cases.push(result);
    await fs.writeFile(path.join(output, `${specimen.id}-metadata.json`), JSON.stringify(result, null, 2) + '\n');
  }
}
report.finishedAt = new Date().toISOString();
report.passed = report.cases.filter(result => result.ok).length;
report.initialSettingsGeometryPassed = report.cases.filter(result => result.pdfInspection?.initialSettingsGeometryMatch).length;
report.requestedViewportGeometryPassed = report.cases.filter(result => result.requestedViewportGeometryMatch).length;
await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
await fs.writeFile(path.join(root, 'native-display-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ passed: report.passed, tested: cases.length, offlineArtifacts: output }));
if (report.passed !== cases.length) process.exitCode = 1;
