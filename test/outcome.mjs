/**
 * Does pressing the button put a real file on disk, at the size of the screen?
 *
 * Outcome only. Not "does teleprint exist", not "is /DCTDecode in the source":
 * a real browser, a real download event, the bytes read back and measured.
 *
 * Display capture cannot be driven headlessly without a permission grant and a
 * picker, so these runs exercise the COMPOSE path and say so. Path A is
 * verified by hand, in a real browser, and its own note records which path
 * produced any given record.
 *
 *   node test/outcome.mjs
 */
import { chromium, firefox, webkit } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'teleprint-'));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript' };

const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'demo.html');
  fs.readFile(file, (error, body) => {
    if (error) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const BASE = `http://127.0.0.1:${server.address().port}/demo.html`;

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
};

const VIEWPORTS = [
  { name: 'phone portrait', width: 393, height: 852 },
  { name: 'phone landscape', width: 852, height: 393 },
  { name: 'desktop', width: 1400, height: 900 }
];

try {
  for (const [engineName, engine] of [['chromium', chromium], ['firefox', firefox], ['webkit', webkit]]) {
    const browser = await engine.launch();
    try {
      for (const viewport of VIEWPORTS) {
        const label = `${engineName} ${viewport.name}`;
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          acceptDownloads: true
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(String(error).slice(0, 140)));
        try {
          await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
          await page.waitForTimeout(700);

          const wait = page.waitForEvent('download', { timeout: 25000 })
            .catch((error) => ({ failed: String(error).slice(0, 110) }));
          await page.locator('#compose').click({ timeout: 10000 });
          const download = await wait;
          if (!download || download.failed) throw new Error(download ? download.failed : 'no download');

          const file = path.join(OUT, `${engineName}-${viewport.width}x${viewport.height}.pdf`);
          await download.saveAs(file);
          const bytes = fs.readFileSync(file);
          const latin = bytes.toString('latin1');

          /* Size is recorded, not graded. An arbitrary byte floor is not a
             fidelity test: a simple frame compresses small and a flat one
             compresses smaller still. The checks that can actually go red are
             the structural ones below; whether the COMPOSE path reproduced the
             page faithfully is NOT asserted here, and the README says so. */
          check(`${label}: a file arrived`, bytes.length > 0,
            `${download.suggestedFilename()} ${bytes.length} bytes`);
          check(`${label}: it is a PDF, opened and closed`,
            latin.startsWith('%PDF-1.4') && latin.trimEnd().endsWith('%%EOF'),
            `${JSON.stringify(latin.slice(0, 8))} .. ${JSON.stringify(latin.trimEnd().slice(-6))}`);

          const box = /\/MediaBox \[0 0 (\d+) (\d+)\]/.exec(latin);
          const image = /\/Subtype \/Image[\s\S]{0,320}?\/Width (\d+)[\s\S]{0,320}?\/Height (\d+)/.exec(latin);
          check(`${label}: it carries an image`,
            Boolean(image) && latin.includes('/DCTDecode'),
            image ? `${image[1]}x${image[2]} /DCTDecode` : 'none');

          /* THE ASSERTION THAT MATTERS: one page unit per captured pixel, and
             the captured pixels are the reader's viewport times their device
             pixel ratio. No paper size, no reduction. */
          const ratio = await page.evaluate(() => window.devicePixelRatio || 1);
          const expectW = Math.round(viewport.width * ratio);
          const expectH = Math.round(viewport.height * ratio);
          check(`${label}: the page is 1:1 with the screen, not scaled to paper`,
            box && Number(box[1]) === expectW && Number(box[2]) === expectH,
            box ? `page ${box[1]}x${box[2]} vs viewport*dpr ${expectW}x${expectH}` : 'no MediaBox');

          check(`${label}: page size equals image size`,
            box && image && box[1] === image[1] && box[2] === image[2],
            box && image ? `${box[1]}x${box[2]} vs ${image[1]}x${image[2]}` : 'missing');

          const wide = viewport.width >= viewport.height;
          check(`${label}: orientation follows the screen, it is not chosen`,
            box && ((Number(box[1]) >= Number(box[2])) === wide),
            box ? `${Number(box[1]) >= Number(box[2]) ? 'landscape' : 'portrait'} page for a ${wide ? 'landscape' : 'portrait'} screen` : 'no MediaBox');

          const stream = /\/Filter \/DCTDecode \/Length (\d+) >>\s*stream\r?\n/.exec(latin);
          let jpegOk = false;
          let jpegDetail = 'no stream';
          if (stream) {
            const start = stream.index + stream[0].length;
            const jpeg = bytes.subarray(start, start + Number(stream[1]));
            jpegOk = jpeg[0] === 0xff && jpeg[1] === 0xd8
              && jpeg[jpeg.length - 2] === 0xff && jpeg[jpeg.length - 1] === 0xd9;
            jpegDetail = `${jpeg.length} bytes ${jpeg.subarray(0, 2).toString('hex')}..${jpeg.subarray(-2).toString('hex')}`;
          }
          check(`${label}: the stream really is a JPEG`, jpegOk, jpegDetail);

          check(`${label}: the record names the path that produced it`,
            /compose|display/.test(latin), 'footer carries the method');

          check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
        } catch (error) {
          check(`${label}: the teleprint completed`, false, String(error).split('\n')[0].slice(0, 140));
        } finally {
          await context.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  server.close();
  fs.rmSync(OUT, { recursive: true, force: true });
}

const failed = results.filter((entry) => !entry.ok);
console.log(`\n${results.length - failed.length}/${results.length} outcome checks passed`);
console.log('NOTE: these runs exercise the COMPOSE path. Display capture needs a');
console.log('permission grant and a picker, so Path A is verified by hand.');
process.exit(failed.length ? 1 : 0);
