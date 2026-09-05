/**
 * THE TEST THIS LANE DID NOT HAVE.
 * ---------------------------------------------------------------------------
 * On 2026-09-05 `print-source-code.js` referenced three identifiers that were
 * never defined -- `headerLines`, `fileBlocks` and `splitIntoVolumes`, each
 * appearing exactly ONCE in the file. Every call threw a ReferenceError, so the
 * Print source code button was dead on the live site.
 *
 * Nothing caught it. `node --check` passes on an undefined identifier: a syntax
 * check parses, it does not resolve names. The lane's offline CI ran that check
 * and went green. An independent comparison of the two driver lanes found it by
 * reading the source.
 *
 * The lesson is narrow and cheap to act on: CALL THE FUNCTIONS. A test that
 * merely imports a module proves almost nothing, because the bodies are never
 * entered. These stub the few browser objects the drivers touch and then
 * actually invoke every exported entry point, so an unresolved name, a bad
 * property access or a broken return shape fails here instead of on a phone.
 *
 *   node --test drivers/gridatlas/smoke.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';

/* A deliberately small stub. It is not a DOM and does not pretend to be one:
   it answers exactly what these drivers ask for and nothing else, so a driver
   that starts depending on something new fails loudly rather than silently
   getting a convincing fake. */
function installBrowser({ resources = [] } = {}) {
  const removed = [];
  const node = (tag) => ({
    tagName: String(tag).toUpperCase(),
    id: '', className: '', style: { cssText: '' }, dataset: {},
    children: [], value: '', readOnly: false, textContent: '', href: '', download: '',
    rel: '', type: '', parentNode: null,
    setAttribute() {}, removeAttribute() {}, addEventListener() {},
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    removeChild(child) { removed.push(child); return child; },
    focus() {}, setSelectionRange() {}, click() {}, closest() { return null; },
    getBoundingClientRect() { return { width: 0, height: 0, top: 0, left: 0 }; },
    classList: { add() {}, remove() {}, contains() { return false; } }
  });
  const body = node('body');
  const documentElement = node('html');
  documentElement.outerHTML = '<html><body>stub</body></html>';
  const stubs = {
    document: {
      documentElement, body,
      title: 'GridAtlas stub',
      createElement: node,
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => []
    },
    window: { innerWidth: 800, innerHeight: 600, devicePixelRatio: 2 },
    location: { href: 'https://example.invalid/atlas/' },
    navigator: { userAgent: 'stub', clipboard: { writeText: async () => {} } },
    performance: { getEntriesByType: () => resources },
    fetch: async () => ({ ok: true, type: 'basic', status: 200, text: async () => 'stub body' }),
    ImageCapture: undefined
  };
  const previous = {};
  for (const [name, value] of Object.entries(stubs)) {
    previous[name] = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  return () => {
    for (const [name, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  };
}

test('collectSourceCode runs to completion and returns a usable record', async (t) => {
  const restore = installBrowser({
    resources: [{ name: 'https://example.invalid/atlas/app.js', initiatorType: 'script' }]
  });
  t.after(restore);
  const { collectSourceCode } = await import('./print-source-code.js');
  const collected = await collectSourceCode({ appName: 'GridAtlas' });
  assert.equal(typeof collected.text, 'string');
  assert.ok(collected.text.includes('TELEPRINT OF THE SOURCE CODE'));
  assert.ok(collected.text.includes('END OF TELEPRINT'));
  assert.match(collected.filename, /GridAtlas-source-code-.*\.txt$/);
  assert.ok(collected.included > 0, 'nothing was collected at all');
  assert.ok(Array.isArray(collected.missing));
  /* The screen state is the reason this file is worth attaching to a chat. */
  assert.equal(collected.state.url, 'https://example.invalid/atlas/');
  assert.equal(collected.state.viewport.width, 800);
});

test('deliverSourceCode returns a record naming how the file was delivered', async (t) => {
  const restore = installBrowser();
  t.after(restore);
  const previousUrl = globalThis.URL.createObjectURL;
  globalThis.URL.createObjectURL = () => 'blob:stub';
  globalThis.URL.revokeObjectURL = () => {};
  t.after(() => { globalThis.URL.createObjectURL = previousUrl; });
  const { collectSourceCode, deliverSourceCode } = await import('./print-source-code.js');
  const collected = await collectSourceCode({ appName: 'GridAtlas' });
  const record = await deliverSourceCode(collected, { panel: true });
  assert.ok(record.via.includes('panel'), 'our own panel must always be offered');
  assert.ok(record.bytes > 0);
  assert.equal(typeof record.filename, 'string');
});

test('screenPdf writes a real one-page PDF with the strip outside the image', async () => {
  const { screenPdf } = await import('./print-pdf.js');
  const width = 4, height = 3;
  const rgba = new Uint8ClampedArray(width * height * 4).fill(200);
  const built = await screenPdf({ width, height, rgba },
    { title: 'stub', url: 'https://example.invalid/', stamp: '2026-01-01 00:00 UTC' });
  const text = Buffer.from(built.bytes).toString('latin1');
  assert.ok(text.startsWith('%PDF-'), 'not a PDF');
  assert.ok(text.trimEnd().endsWith('%%EOF'), 'truncated PDF');
  assert.ok(text.includes('/FlateDecode'));
  assert.equal(built.pageWidth, width, 'the page must be the capture width, not paper');
  /* The record must never be written on: the page is TALLER than the image and
     the provenance lives in the space that adds. */
  assert.ok(built.pageHeight > height, 'the strip is not outside the image');
  assert.equal(built.pageHeight - built.strip, height);
});

test('screenPdf refuses a frame whose samples do not match its dimensions', async () => {
  const { screenPdf } = await import('./print-pdf.js');
  await assert.rejects(
    () => screenPdf({ width: 4, height: 3, rgba: new Uint8ClampedArray(8) }),
    /wrong number of samples/);
});
