import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createSourceCodeBundle, verifySourceCodeBundle, verifySourceCodeBundleAgainstRepository, writeSourceCodeBundle } from './source-code.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
test('committed source inventory, exact bytes, integrity, and pinned revision', async t => {
  const repoDir = await mkdtemp(join(tmpdir(), 'print-source-code-'));
  t.after(() => rm(repoDir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-C', repoDir, ...args], { encoding: 'utf8', windowsHide: true }).trim();
  git('init', '-q');
  git('config', 'user.name', 'Source Test');
  git('config', 'user.email', 'source-test@example.invalid');
  git('config', 'core.autocrlf', 'false');
  git('remote', 'add', 'origin', 'https://github.com/example/fixture.git');
  await mkdir(join(repoDir, 'src'));
  const original = Buffer.from('\ufeffconst greeting = "café 🙂";\r\n// no terminal newline');
  await writeFile(join(repoDir, 'src/main.js'), original);
  await writeFile(join(repoDir, 'src/empty.txt'), '');
  await writeFile(join(repoDir, 'src/image.bin'), Buffer.from([0, 255, 4, 1]));
  await writeFile(join(repoDir, 'src/legacy.txt'), Buffer.from([255, 254, 65]));
  await writeFile(join(repoDir, '.hidden'), 'hidden\n');
  git('add', '.'); git('commit', '-qm', 'first');
  const first = git('rev-parse', 'HEAD');
  await writeFile(join(repoDir, 'src/main.js'), 'second revision\n');
  git('add', '.'); git('commit', '-qm', 'second');
  const second = git('rev-parse', 'HEAD');
  await writeFile(join(repoDir, 'src/main.js'), 'DIRTY MUST NEVER APPEAR');
  await writeFile(join(repoDir, 'src/untracked.js'), 'UNTRACKED MUST NEVER APPEAR');
  const options = { repoDir, revision: first };
  const bundle = await createSourceCodeBundle(options);

  await t.test('preserves BOM, Unicode, CRLF, empty file, and missing terminal newline from Git', async () => {
    assert.equal(bundle.manifest.repository, 'https://github.com/example/fixture');
    assert.equal(bundle.manifest.commit, first);
    assert.equal(bundle.manifest.includedCount, 3);
    assert.equal(bundle.manifest.omittedCount, 2);
    const file = bundle.manifest.files.find(file => file.path === 'src/main.js');
    assert.deepEqual(Buffer.from(bundle.text).subarray(file.startByte, file.startByte + file.byteCount), original);
    assert.equal(file.sha256, hash(original));
    assert.equal(file.byteCount, original.length);
    assert.ok(!bundle.text.includes('DIRTY MUST NEVER APPEAR'));
    assert.ok(!bundle.text.includes('UNTRACKED MUST NEVER APPEAR'));
    assert.ok(bundle.manifest.files.find(file => file.path === 'src/image.bin').reason.includes('Binary'));
    assert.ok(bundle.manifest.files.find(file => file.path === 'src/legacy.txt').reason.includes('Non-UTF-8'));
    assert.deepEqual(await createSourceCodeBundle(options), bundle);
    assert.equal(await verifySourceCodeBundleAgainstRepository(bundle.text, bundle.manifest, { repoDir, expectedCommit: first, paths: ['.'] }), true);
  });
  await t.test('literal scopes deduplicate without widening coverage', async () => {
    const scoped = await createSourceCodeBundle({ ...options, paths: ['src/main.js', 'src/main.js'] });
    assert.equal(scoped.manifest.files.length, 1);
    assert.equal(scoped.manifest.files[0].path, 'src/main.js');
  });
  await t.test('missing revision, missing scope, traversal, and zero text coverage fail', async () => {
    for (const changes of [{ revision: '' }, { revision: 'not-a-real-commit' }, { paths: ['missing'] }, { paths: ['../src'] }, { paths: ['/src'] }, { paths: ['src\\main.js'] }, { paths: ['C:/src'] }, { paths: ['src/image.bin'] }, { paths: [] }]) {
      await assert.rejects(createSourceCodeBundle({ ...options, ...changes }), /Print source code:/);
    }
  });
  await t.test('mutation fails even after outer digest is recomputed', () => {
    const mutated = bundle.text.replace('const greeting', 'const greetinx');
    assert.throws(() => verifySourceCodeBundle(mutated, bundle.manifest), /SHA256 mismatch/);
    assert.throws(() => verifySourceCodeBundle(mutated, { ...bundle.manifest, sha256: hash(mutated) }), /file integrity mismatch/);
  });
  await t.test('omitted inventory fails; fully rebuilt partial inventory fails repository coverage', async () => {
    const omitted = structuredClone(bundle.manifest);
    omitted.files = omitted.files.filter(file => file.path !== '.hidden');
    omitted.includedCount--;
    assert.throws(() => verifySourceCodeBundle(bundle.text, omitted), /boundary|coverage/);
    const subset = await createSourceCodeBundle({ ...options, paths: ['src'] });
    await assert.rejects(verifySourceCodeBundleAgainstRepository(subset.text, subset.manifest, { repoDir, expectedCommit: first, paths: ['.'] }), /committed repository inventory/);
  });
  await t.test('a valid bundle from the wrong revision fails expected commit verification', async () => {
    const wrong = await createSourceCodeBundle({ ...options, revision: second });
    assert.throws(() => verifySourceCodeBundle(wrong.text, wrong.manifest, { expectedCommit: first }), /commit mismatch/);
    await assert.rejects(verifySourceCodeBundleAgainstRepository(wrong.text, wrong.manifest, { repoDir, expectedCommit: first }), /commit mismatch/);
  });
  await t.test('output files round-trip with exact UTF-8 bytes', async () => {
    const textPath = join(repoDir, 'output/source.txt');
    const manifestPath = join(repoDir, 'output/source.manifest.json');
    await writeSourceCodeBundle({ ...options, textPath, manifestPath });
    assert.deepEqual(await readFile(textPath), Buffer.from(bundle.text));
    assert.deepEqual(JSON.parse(await readFile(manifestPath, 'utf8')), bundle.manifest);
  });
  await t.test('browser verifies before enabling controls and preserves full clipboard/fallback text', async () => {
    const source = await readFile(new URL('./print-source-code.js', import.meta.url), 'utf8');
    const browser = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    const names = ['location', 'fetch', 'document', 'navigator', 'CustomEvent'];
    const descriptors = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    class Element {
      constructor(tag = 'button') { this.tag = tag; this.disabled = false; this.children = []; this.style = {}; this.listeners = new Map(); this.attributes = {}; }
      setAttribute(key, value) { this.attributes[key] = value; }
      removeAttribute(key) { delete this.attributes[key]; }
      addEventListener(name, listener) { this.listeners.set(name, listener); }
      removeEventListener(name) { this.listeners.delete(name); }
      dispatchEvent() {}
      append(...children) { this.children.push(...children); }
      insertAdjacentElement(_, element) { this.children.push(element); }
      querySelector(tag) { return this.children.find(child => child.tag === tag); }
      focus() { this.focused = true; }
      select() { this.selected = true; }
      remove() {}
    }
    let servedText = bundle.text;
    let servedManifest = bundle.manifest;
    let clipboardText;
    let failClipboard = false;
    const navigation = { clipboard: { writeText(text) { if (failClipboard) return Promise.reject(new Error('denied')); clipboardText = text; return Promise.resolve(); } } };
    const globals = {
      location: { href: 'https://example.test/app', origin: 'https://example.test' },
      fetch: async (url, options) => {
        assert.equal(options.redirect, 'error');
        assert.equal(options.cache, 'no-store');
        return new Response(url.endsWith('.json') ? JSON.stringify(servedManifest) : Buffer.from(servedText));
      },
      document: { createElement: tag => new Element(tag), body: new Element('body') },
      navigator: navigation,
      CustomEvent: class { constructor(name, options) { this.type = name; this.detail = options.detail; } },
    };
    for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, value });
    try {
      const button = new Element(), copyButton = new Element(), status = new Element('p'), container = new Element('div');
      const setup = { button, copyButton, status, fallbackContainer: container, manifestUrl: '/source.json', textUrl: '/source.txt', expectedCommit: first };
      const detach = browser.attachPrintSourceCode(setup);
      assert.equal(button.disabled, true);
      await copyButton.listeners.get('click')();
      assert.equal(clipboardText, undefined);
      assert.ok(await detach.ready);
      assert.equal(button.disabled, false);
      assert.equal(button.textContent, 'Print source code');
      await copyButton.listeners.get('click')();
      assert.equal(clipboardText, bundle.text);
      assert.equal(status.textContent, 'Source code copied. Paste it into ChatGPT.');
      failClipboard = true;
      await copyButton.listeners.get('click')();
      const textarea = container.children[0].querySelector('textarea');
      assert.equal(textarea.value, bundle.text);
      assert.equal(textarea.selected, true);
      assert.match(status.textContent, /Automatic copy is unavailable/);
      detach();
      servedText = servedText.replace('const greeting', 'const greetinx');
      let caught;
      const failed = browser.attachPrintSourceCode({ ...setup, onError: error => { caught = error; } });
      assert.equal(await failed.ready, null);
      assert.match(caught.message, /integrity check failed/);
      assert.equal(copyButton.disabled, true);
      failed();
      await assert.rejects(browser.fetchVerifiedSourceCode({ ...setup, textUrl: 'https://elsewhere.test/source.txt' }), /same-origin/);
      servedText = bundle.text;
      await assert.rejects(browser.fetchVerifiedSourceCode({ ...setup, expectedCommit: second }), /commit mismatch/);
      servedManifest = structuredClone(bundle.manifest);
      servedManifest.files = servedManifest.files.filter(file => file.path !== '.hidden');
      servedManifest.includedCount--;
      await assert.rejects(browser.fetchVerifiedSourceCode(setup), /inventory or file boundaries/);
    } finally {
      for (const name of names) {
        const descriptor = descriptors.get(name);
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
    }
  });
});
