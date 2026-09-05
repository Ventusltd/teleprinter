import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('./runtime-source.js', import.meta.url), 'utf8');
const { captureRuntimeSource } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const baseBytes = new TextEncoder().encode('PRINT SOURCE CODE\nPinned café source\n');
const baseManifest = { byteCount: baseBytes.length, sha256: createHash('sha256').update(baseBytes).digest('hex'), commit: 'a'.repeat(40) };

function install({ blocked = false, many = false } = {}) {
  const base = 'https://app.test/view/';
  const binary = Uint8Array.from([0, 255, 3, 128]);
  const responses = new Map([
    [base, ['<html>original network document</html>', 'text/html']],
    [base + 'app.js', ['import "./child.js"; import( "./dynamic.js" ); export { x } from "./child.js";', 'text/javascript']],
    [base + 'child.js', ['export const x = 1; const inactive = new URL("./huge-unrequested.parquet", import.meta.url);', 'text/javascript']],
    [base + 'dynamic.js', ['export default 7;', 'text/javascript']],
    [base + 'inline.js', ['export const inline = true;', 'text/javascript']],
    [base + 'style.css', ['@import "./nested.css"; body{background:url("./asset.bin")}', 'text/css']],
    [base + 'nested.css', ['p{color:red}', 'text/css']],
    [base + 'asset.bin', [binary, 'application/octet-stream']],
    [base + 'missing.json', ['{"error":"not found"}', 'application/json', 404]],
    ['https://cdn.test/library.js', ['export const remote = true;', 'text/javascript']],
    ['blob:https://app.test/example', ['globalThis.neverExecuteThis = true;', 'text/javascript']],
  ]);
  const calls = [];
  const form = [
    { tagName: 'INPUT', id: 'layer', name: 'layer', type: 'checkbox', value: 'grid', checked: true, disabled: false },
    { tagName: 'SELECT', id: 'choice', name: 'choice', type: 'select-one', value: 'solar', options: [{ value: 'solar', text: 'Solar', selected: true }], disabled: false },
    { tagName: 'TEXTAREA', id: 'notes', name: 'notes', type: 'textarea', value: 'Live unsaved notes', disabled: false },
  ];
  const lists = {
    'input,textarea,select': form,
    script: [{ src: base + 'app.js', type: 'module' }, { src: '', type: 'module', textContent: 'import "./inline.js";' }, { src: 'blob:https://app.test/example' }],
    'link[rel="stylesheet"]': [{ href: base + 'style.css' }],
    img: [{ src: base + 'asset.bin', currentSrc: base + 'asset.bin' }], style: [], '[style]': [], iframe: [],
  };
  const globals = {
    location: { href: base, origin: 'https://app.test' }, innerWidth: 393, innerHeight: 852, devicePixelRatio: 3, scrollX: 0, scrollY: 21,
    performance: { getEntriesByType: () => many ? Array.from({ length: 1501 }, (_, i) => ({ name: base + i + '.js' })) : [{ name: base + 'app.js', initiatorType: 'script' }, { name: base + 'style.css' }, { name: 'https://cdn.test/library.js' }, { name: base + 'atlas-source-code.txt' }, { name: base + 'atlas-source-code.manifest.json' }, { name: base + 'atlas-source-pin.json' }, ...(blocked ? [{ name: 'https://blocked.test/lib.js' }, { name: base + 'missing.json' }] : [])] },
    document: { title: 'Live Grid Atlas', baseURI: base, documentElement: { outerHTML: '<html><body>Current DOM + inline source</body></html>' }, body: { innerText: 'Current visible layers' }, querySelectorAll: selector => lists[selector] ?? [] },
    window: { __GRIDATLAS_V9_MAP__: { getCenter: () => ({ lng: -2.5, lat: 52 }), getZoom: () => 10, getBearing: () => 20, getPitch: () => 30, getStyle: () => ({ layers: [{ id: 'grid', layout: { visibility: 'visible' } }], sources: { substations: { type: 'geojson' } } }) } },
  };
  const saved = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
  return {
    calls, binary,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.startsWith('https://blocked.test')) throw new TypeError('CORS blocked');
      const response = responses.get(url);
      assert.ok(response, 'unexpected fetch: ' + url);
      return new Response(response[0], { status: response[2] ?? 200, headers: { 'content-type': response[1] } });
    },
    restore() { for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } },
  };
}

test('captures pinned source, current DOM/forms/map, recursive scripts/CSS, blobs and complete binary bytes', async () => {
  const env = install();
  try {
    const { bytes, manifest } = await captureRuntimeSource({ baseBytes, baseManifest, fetchImpl: env.fetchImpl });
    const text = new TextDecoder().decode(bytes);
    assert.ok(text.includes(new TextDecoder().decode(baseBytes)));
    assert.ok(text.includes('<html><body>Current DOM + inline source</body></html>'));
    assert.equal(manifest.state.forms[0].checked, true);
    assert.equal(manifest.state.forms[1].selected[0].value, 'solar');
    assert.equal(manifest.state.forms[2].value, 'Live unsaved notes');
    assert.equal(manifest.state.map.layers[0].id, 'grid');
    assert.equal(manifest.state.viewport.devicePixelRatio, 3);
    assert.equal(manifest.complete, false, 'browser discovery must not claim all dependencies proven');
    assert.equal(manifest.observedResourcesComplete, true);
    assert.equal(manifest.failures.length, 0);
    assert.equal(manifest.exclusions.length, 3);
    assert.equal(env.calls.filter(call => call.url.endsWith('/child.js')).length, 1);
    assert.ok(env.calls.some(call => call.url.endsWith('/dynamic.js')));
    assert.ok(env.calls.some(call => call.url.endsWith('/nested.css')));
    assert.ok(env.calls.some(call => call.url.endsWith('/inline.js')));
    assert.ok(env.calls.some(call => call.url.startsWith('blob:')));
    assert.equal(globalThis.neverExecuteThis, undefined);
    assert.equal(env.calls.find(call => call.url.startsWith('https://cdn.test')).options.credentials, 'omit');
    assert.equal(env.calls.find(call => call.url.endsWith('/app.js')).options.credentials, 'same-origin');
    assert.ok(env.calls.every(call => call.options.cache === 'force-cache'));
    const binary = manifest.resources.find(resource => resource.url.endsWith('/asset.bin'));
    assert.equal(binary.encoding, 'base64');
    assert.equal(binary.byteCount, 4);
    assert.equal(binary.sha256, createHash('sha256').update(env.binary).digest('hex'));
    assert.ok(text.includes(Buffer.from(env.binary).toString('base64')));
    assert.equal(manifest.byteCount, bytes.length);
    assert.equal(manifest.sha256, createHash('sha256').update(bytes).digest('hex'));
  } finally { env.restore(); }
});

test('CORS failure and HTTP error remain visible, with complete error response body', async () => {
  const env = install({ blocked: true });
  try {
    const result = await captureRuntimeSource({ baseBytes, baseManifest, fetchImpl: env.fetchImpl });
    assert.equal(result.manifest.complete, false);
    assert.equal(result.manifest.observedResourcesComplete, false);
    assert.equal(result.manifest.failures.length, 2);
    assert.ok(new TextDecoder().decode(result.bytes).includes('CORS blocked'));
    assert.ok(new TextDecoder().decode(result.bytes).includes('{"error":"not found"}'));
    assert.equal(result.manifest.resources.find(resource => resource.url.endsWith('/missing.json')).status, 'included-http-error');
  } finally { env.restore(); }
});

test('tampered pinned bytes and an excessive dependency graph fail explicitly', async () => {
  const env = install({ many: true });
  try {
    await assert.rejects(captureRuntimeSource({ baseBytes: new Uint8Array(baseBytes.length), baseManifest, fetchImpl: env.fetchImpl }), /SHA256 check/);
    await assert.rejects(captureRuntimeSource({ baseBytes, baseManifest, fetchImpl: env.fetchImpl }), /1,500-resource limit/);
    assert.equal(env.calls.length, 0);
  } finally { env.restore(); }
});
