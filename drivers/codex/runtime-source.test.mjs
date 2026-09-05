import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('./runtime-source.js', import.meta.url), 'utf8');
const { captureRuntimeSource } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const baseBytes = new TextEncoder().encode('PRINT SOURCE CODE\nPinned café source\n');
const baseManifest = { byteCount: baseBytes.length, sha256: createHash('sha256').update(baseBytes).digest('hex'), commit: 'a'.repeat(40) };

function install({ blocked = false, many = false, mapStyle, documentBase } = {}) {
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
    document: { title: 'Live Grid Atlas', baseURI: documentBase || base, documentElement: { outerHTML: '<html><body>Current DOM + inline source</body></html>' }, body: { innerText: 'Current visible layers' }, querySelectorAll: selector => lists[selector] ?? [] },
    window: { __GRIDATLAS_V9_MAP__: { getCenter: () => ({ lng: -2.5, lat: 52 }), getZoom: () => 10, getBearing: () => 20, getPitch: () => 30, getStyle: () => mapStyle || ({ layers: [{ id: 'grid', layout: { visibility: 'visible' } }], sources: { substations: { type: 'geojson' } } }) } },
  };
  const saved = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
  return {
    calls, binary, lists, responses,
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

test('worker-only live GeoJSON resolves against the remote document base and is included completely', async () => {
  const documentBase = 'https://ventusltd.github.io/gridatlas/atlas/releases/202608300453-atlas-v9/';
  const data = '../cartridges/5f5fbec83f9ce307b47ddc6e7277743f0bba1a2445b0f3ca50a9a1806146e993/grid_400kv.geojson';
  const full = new URL(data, documentBase).href;
  const geojson = JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { voltage: 400000 }, geometry: { type: 'LineString', coordinates: [[1, 2], [3, 4]] } }] });
  const env = install({ documentBase, mapStyle: { layers: [{ id: 'l-400', source: 'src-400', layout: { visibility: 'visible' } }], sources: { 'src-400': { type: 'geojson', data }, inline: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } } } });
  env.lists.script = env.lists.script.filter(script => script.src);
  env.responses.set(full, [geojson, 'application/geo+json']);
  try {
    const result = await captureRuntimeSource({ baseBytes, baseManifest, fetchImpl: env.fetchImpl });
    const resource = result.manifest.resources.find(resource => resource.url === full);
    assert.equal(resource.status, 'included');
    assert.deepEqual(resource.expectedKinds, ['geojson']);
    assert.ok(resource.discoveredBy.some(item => item.reason.includes('src-400') && item.reason.includes('l-400')));
    assert.equal(resource.byteCount, Buffer.byteLength(geojson));
    assert.equal(resource.sha256, createHash('sha256').update(geojson).digest('hex'));
    assert.ok(new TextDecoder().decode(result.bytes).includes(geojson));
    assert.equal(env.calls.filter(call => call.url === full).length, 1);
    assert.ok(result.manifest.mapDependencies.some(item => item.status === 'embedded-state'));
    assert.deepEqual(result.manifest.state.map.sources.inline.data.features, []);
    assert.equal(result.manifest.state.resourceTiming.historyComplete, false);
    assert.equal(result.manifest.complete, false);
    assert.equal(result.manifest.failures.length, 0);
  } finally { env.restore(); }
});

test('TileJSON advertised URLs and DPR sprite pair are fetched; tile/glyph templates are explicit gaps', async () => {
  const env = install({ mapStyle: {
    layers: [{ id: 'roads', source: 'vector', layout: { visibility: 'visible' } }],
    sources: { vector: { type: 'vector', url: './tiles/tilejson.json' }, raster: { type: 'raster', tiles: ['https://tiles.test/{z}/{x}/{y}.png'] } },
    glyphs: './fonts/{fontstack}/{range}.pbf', sprite: './sprites/default?key=public',
  } });
  env.responses.set('https://app.test/view/tiles/tilejson.json', [JSON.stringify({ tilejson: '3.0.0', tiles: ['./7/2/3.pbf', './{z}/{x}/{y}.pbf'], data: ['./metadata.json'] }), 'application/json']);
  env.responses.set('https://app.test/view/tiles/7/2/3.pbf', [env.binary, 'application/x-protobuf']);
  env.responses.set('https://app.test/view/tiles/metadata.json', ['{"source":"roads"}', 'application/json']);
  env.responses.set('https://app.test/view/sprites/default@2x.json?key=public', ['{"marker":{"x":0,"y":0,"width":1,"height":1}}', 'application/json']);
  env.responses.set('https://app.test/view/sprites/default@2x.png?key=public', [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), 'image/png']);
  try {
    const result = await captureRuntimeSource({ baseBytes, baseManifest, fetchImpl: env.fetchImpl });
    assert.ok(env.calls.some(call => call.url.endsWith('/tiles/7/2/3.pbf')));
    assert.ok(env.calls.some(call => call.url.endsWith('/tiles/metadata.json')));
    assert.ok(env.calls.some(call => call.url.endsWith('/default@2x.png?key=public')));
    assert.ok(env.calls.every(call => !/[{}]|%7B|%7D/i.test(call.url)), 'templates must never be fetched as invented coordinates');
    assert.equal(result.manifest.mapDependencies.filter(item => item.status === 'unresolved-template').length, 3);
    assert.ok(result.manifest.discoveryWarnings.some(item => item.reason.includes('Exact rendered worker tile set')));
    assert.equal(result.manifest.observedResourcesComplete, false);
    assert.equal(result.manifest.failures.length, 0);
  } finally { env.restore(); }
});

test('HTML or invalid JSON masquerading as live GeoJSON/TileJSON is retained but fails validation', async () => {
  const env = install({ mapStyle: { layers: [], sources: { bad: { type: 'geojson', data: './bad.geojson' }, vector: { type: 'vector', url: './bad-tilejson.json' } } } });
  env.responses.set('https://app.test/view/bad.geojson', ['<html>error page returned with status 200</html>', 'text/html']);
  env.responses.set('https://app.test/view/bad-tilejson.json', ['{"message":"missing tiles"}', 'application/json']);
  try {
    const result = await captureRuntimeSource({ baseBytes, baseManifest, fetchImpl: env.fetchImpl });
    assert.equal(result.manifest.failures.length, 2);
    assert.equal(result.manifest.resources.filter(resource => resource.status === 'included-invalid-map-data').length, 2);
    assert.ok(new TextDecoder().decode(result.bytes).includes('<html>error page returned with status 200</html>'));
    assert.equal(result.manifest.observedResourcesComplete, false);
  } finally { env.restore(); }
});

test('nested open shadow roots retain HTML, live forms, and stylesheet dependencies', async () => {
  const env = install();
  const inner = { innerHTML: '<textarea>default</textarea>', textContent: 'default', querySelectorAll: selector => selector === 'input,textarea,select' ? [{ tagName: 'TEXTAREA', id: 'shadow-notes', value: 'Edited in shadow', type: 'textarea' }] : [] };
  const outer = { innerHTML: '<style>.x{background:url("./shadow.png")}</style><nested-widget></nested-widget>', textContent: 'shadow content', querySelectorAll: selector => selector === '*' ? [{ tagName: 'NESTED-WIDGET', shadowRoot: inner }] : selector === 'style' ? [{ textContent: '.x{background:url("./shadow.png")}' }] : [] };
  env.lists['*'] = [{ tagName: 'TELEPRINTER-TOOLS', id: 'tools', shadowRoot: outer }];
  env.responses.set('https://app.test/view/shadow.png', [env.binary, 'image/png']);
  try {
    const result = await captureRuntimeSource({ baseBytes, baseManifest, fetchImpl: env.fetchImpl });
    assert.equal(result.manifest.state.openShadowRoots.length, 2);
    assert.ok(result.manifest.state.openShadowRoots[0].html.includes('nested-widget'));
    const form = result.manifest.state.forms.find(control => control.id === 'shadow-notes');
    assert.equal(form.value, 'Edited in shadow');
    assert.ok(form.root.includes('NESTED-WIDGET'));
    assert.ok(env.calls.some(call => call.url.endsWith('/shadow.png')));
    assert.ok(new TextDecoder().decode(result.bytes).includes('Edited in shadow'));
  } finally { env.restore(); }
});

test('global inline map geometry remains complete while public rendered features are clearly derived', async () => {
  const inlineData = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { onlyGlobal: 'not copied' }, geometry: { type: 'Point', coordinates: [12, 34] } }] };
  const env = install({ mapStyle: { layers: [{ id: 'visible', source: 'inline' }], sources: { inline: { type: 'geojson', data: inlineData } } } });
  window.__GRIDATLAS_V9_MAP__.queryRenderedFeatures = () => [{ type: 'Feature', id: 7, source: 'inline', layer: { id: 'visible' }, properties: { voltage: 275000 }, geometry: { type: 'Point', coordinates: [1, 2] } }];
  try {
    const { manifest, bytes } = await captureRuntimeSource({ baseBytes, baseManifest, fetchImpl: env.fetchImpl });
    assert.deepEqual(manifest.state.map.sources.inline.data, inlineData);
    const serialized = new TextDecoder().decode(bytes).split('===== BEGIN DIAGNOSTIC MANIFEST =====\n')[1].split('\n===== END DIAGNOSTIC MANIFEST =====')[0];
    assert.deepEqual(JSON.parse(serialized).state.map.sources.inline.data, inlineData);
    assert.equal(manifest.state.map.renderedFeatures.count, 1);
    assert.equal(manifest.state.map.renderedFeatures.features[0].properties.voltage, 275000);
    assert.match(manifest.state.map.renderedFeatures.provenance, /NOT original worker tile bytes/);
    assert.equal(inlineData.features[0].properties.onlyGlobal, 'not copied', 'capture must not mutate live map source');
  } finally { env.restore(); }
});

function installDirectTransport(env, { oversized = false, timedOut = false } = {}) {
  const savedFetch = globalThis.fetch;
  const savedXHR = Object.getOwnPropertyDescriptor(globalThis, 'XMLHttpRequest');
  let overriddenFetchCalls = 0;
  globalThis.fetch = async () => { overriddenFetchCalls++; throw new Error('DuckDB: No magic bytes found at end of parquet file'); };
  env.lists.script = env.lists.script.filter(script => !script.src?.startsWith('blob:'));
  class DiagnosticXHR {
    open(method, url, async) { assert.equal(method, 'GET'); assert.equal(async, true); this.url = url; }
    send() {
      assert.equal(this.responseType, 'arraybuffer');
      assert.equal(this.withCredentials, false);
      assert.equal(this.timeout, 30000);
      queueMicrotask(() => {
        if (timedOut) { this.ontimeout?.(); return; }
        if (this.url.startsWith('https://blocked.test')) { this.onerror?.(); return; }
        if (oversized) { this.onprogress?.({ loaded: 257 * 1024 * 1024 }); return; }
        const response = env.responses.get(this.url);
        assert.ok(response, `unexpected direct request ${this.url}`);
        const bytes = typeof response[0] === 'string' ? new TextEncoder().encode(response[0]) : response[0];
        this.status = response[2] ?? 200;
        this.responseURL = this.url;
        this.contentType = response[1];
        this.response = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        this.onprogress?.({ loaded: bytes.length });
        this.onload?.();
      });
    }
    getResponseHeader(name) { return name === 'content-type' ? this.contentType : null; }
    abort() { this.aborted = true; this.onabort?.(); }
  }
  globalThis.XMLHttpRequest = DiagnosticXHR;
  return { calls: () => overriddenFetchCalls, restore() {
    globalThis.fetch = savedFetch;
    if (savedXHR) Object.defineProperty(globalThis, 'XMLHttpRequest', savedXHR);
    else delete globalThis.XMLHttpRequest;
  } };
}

test('default HTTP capture bypasses overridden Atlas fetch and preserves actual GeoJSON bytes', async () => {
  const env = install({ mapStyle: { layers: [{ id: 'grid400', source: 'grid400' }], sources: { grid400: { type: 'geojson', data: './grid_400kv.geojson' } } } });
  const geojson = JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'café ⚡' }, geometry: { type: 'Point', coordinates: [1, 2] } }] });
  env.responses.set('https://app.test/view/grid_400kv.geojson', [geojson, 'application/geo+json']);
  const transport = installDirectTransport(env);
  try {
    const { bytes, manifest } = await captureRuntimeSource({ baseBytes, baseManifest });
    assert.equal(transport.calls(), 0, 'application fetch override must never service HTTP diagnostic requests');
    assert.equal(manifest.failures.length, 0);
    const resource = manifest.resources.find(item => item.url.endsWith('/grid_400kv.geojson'));
    assert.match(resource.transport, /XMLHttpRequest/);
    assert.equal(resource.status, 'included');
    assert.equal(resource.sha256, createHash('sha256').update(geojson).digest('hex'));
    assert.ok(new TextDecoder().decode(bytes).includes(geojson));
    const binary = manifest.resources.find(item => item.url.endsWith('/asset.bin'));
    assert.equal(binary.sha256, createHash('sha256').update(env.binary).digest('hex'));
  } finally { transport.restore(); env.restore(); }
});

test('direct HTTP preserves error bodies, reports CORS, and aborts excessive byte growth', async () => {
  const env = install({ blocked: true });
  const transport = installDirectTransport(env);
  try {
    const { bytes, manifest } = await captureRuntimeSource({ baseBytes, baseManifest });
    assert.equal(transport.calls(), 0);
    assert.equal(manifest.failures.length, 2);
    assert.match(new TextDecoder().decode(bytes), /\{"error":"not found"\}/);
    assert.ok(manifest.failures.some(failure => /network\/CORS/.test(failure.reason)));
  } finally { transport.restore(); env.restore(); }
  const largeEnv = install();
  const largeTransport = installDirectTransport(largeEnv, { oversized: true });
  try {
    await assert.rejects(captureRuntimeSource({ baseBytes, baseManifest }), /explicit 256 MiB resource limit/);
    assert.equal(largeTransport.calls(), 0);
  } finally { largeTransport.restore(); largeEnv.restore(); }
  const timeoutEnv = install();
  const timeoutTransport = installDirectTransport(timeoutEnv, { timedOut: true });
  try {
    const { manifest } = await captureRuntimeSource({ baseBytes, baseManifest });
    assert.ok(manifest.failures.length > 0);
    assert.ok(manifest.failures.every(failure => /30-second timeout/.test(failure.reason)));
    assert.equal(timeoutTransport.calls(), 0, 'timeouts must never silently fall back to the application fetch override');
  } finally { timeoutTransport.restore(); timeoutEnv.restore(); }
});
