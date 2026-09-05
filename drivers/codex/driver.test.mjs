/** Deterministic lifecycle checks complement the real-browser download outcomes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { clickAndReadDownload } from './driver.mjs';

function fixture(overrides = {}) {
  const state = { deleted: 0, cancelled: 0 };
  const download = {
    failure: async () => null,
    createReadStream: async () => Readable.from([Buffer.from('complete '), Buffer.from('bytes\0\xff', 'latin1')]),
    suggestedFilename: () => 'source.txt',
    cancel: async () => { state.cancelled++; },
    delete: async () => { state.deleted++; },
    ...overrides,
  };
  return { state, download, page: { waitForEvent: async () => download }, locator: { click: async () => {} } };
}

// A broken driver must fail this test instead of hanging the whole test process.
async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Driver did not settle within the 1-second test watchdog.')), 1000); }),
    ]);
  } finally { clearTimeout(timer); }
}

test('acquired download is deleted when its originating click rejects', async () => {
  const { state, page } = fixture();
  const result = await bounded(clickAndReadDownload(page, { click: async () => { throw new Error('click rejected after download started'); } }, { timeout: 40 }));
  assert.equal(result.ok, false);
  assert.match(result.error, /click rejected/);
  assert.equal(state.deleted, 1, 'the acquired download must be deleted on the failed-click branch');
});

test('missing download and click timeout both reject without an unhandled promise', async () => {
  let eventSettled = false;
  let clickSettled = false;
  const page = { waitForEvent(event, options) {
    assert.equal(event, 'download');
    assert.equal(options.timeout, 40);
    return new Promise((_, reject) => setTimeout(() => { eventSettled = true; reject(new Error('download event timed out')); }, 15));
  } };
  const locator = { click(options) {
    assert.equal(options.timeout, 40);
    return new Promise((_, reject) => setTimeout(() => { clickSettled = true; reject(new Error('click timed out')); }, 5));
  } };
  const result = await bounded(clickAndReadDownload(page, locator, { timeout: 40 }));
  assert.equal(result.ok, false);
  assert.match(result.error, /timed out/);
  assert.equal(eventSettled, true);
  assert.equal(clickSettled, true);
});

test('download completion that never settles is bounded and cleaned up', async () => {
  const { page, locator, state } = fixture({ failure: () => new Promise(() => {}) });
  const result = await bounded(clickAndReadDownload(page, locator, { timeout: 40 }));
  assert.equal(result.ok, false);
  assert.match(result.error, /timed?\s*out|timeout|did not finish in time/i);
  assert.equal(state.deleted, 1);
});

test('readback that never produces EOF is bounded, destroyed, and deleted', async () => {
  const stream = new Readable({ read() {} });
  const { page, locator, state } = fixture({ createReadStream: async () => stream });
  try {
    const result = await bounded(clickAndReadDownload(page, locator, { timeout: 40 }));
    assert.equal(result.ok, false);
    assert.match(result.error, /timed?\s*out|timeout|did not finish in time/i);
    assert.equal(state.deleted, 1);
    assert.equal(stream.destroyed, true, 'a timed-out read must not leave its stream open');
  } finally { stream.destroy(); }
});

test('readback errors return a failed result and delete the download', async () => {
  const stream = Readable.from((async function* () {
    yield Buffer.from('partial content');
    throw new Error('readback disconnected');
  })());
  const { page, locator, state } = fixture({ createReadStream: async () => stream });
  const result = await bounded(clickAndReadDownload(page, locator, { timeout: 40 }));
  assert.equal(result.ok, false);
  assert.match(result.error, /readback disconnected/);
  assert.equal(state.deleted, 1);
});

test('successful readback returns every original byte and deletes the download', async () => {
  const { page, locator, state } = fixture();
  const result = await bounded(clickAndReadDownload(page, locator, { timeout: 40 }));
  assert.equal(result.ok, true);
  assert.equal(result.filename, 'source.txt');
  assert.deepEqual(result.bytes, Buffer.from('complete bytes\0\xff', 'latin1'));
  assert.equal(state.deleted, 1);
});
