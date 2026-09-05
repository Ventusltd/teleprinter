import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { decodePngPixels } from './png-pixels.mjs';

// Deliberately separate bit-at-a-time CRC implementation from the decoder's table.
function chunk(type, data = Buffer.alloc(0)) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const value of body) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, body, checksum]);
}
function png({ width = 2, height = 2, color = 2, depth = 8, interlace = 0, raw, before = [], after = [], compressed, split = false } = {}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = depth; header[9] = color; header[12] = interlace;
  const encoded = compressed ?? deflateSync(Buffer.from(raw));
  const data = split ? [chunk('IDAT', encoded.subarray(0, 3)), chunk('IDAT'), chunk('IDAT', encoded.subarray(3))] : [chunk('IDAT', encoded)];
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), ...before, ...data, ...after, chunk('IEND')]);
}
const row0 = [10, 20, 30, 50, 60, 70];
const expected = Uint8Array.from([10, 20, 30, 255, 50, 60, 70, 255, 15, 25, 35, 255, 80, 90, 100, 255]);
// These are hand-calculated encoded bytes, not output from a copy of the unfilter code.
const encodedRows = [
  [15, 25, 35, 80, 90, 100],
  [15, 25, 35, 65, 65, 65],
  [5, 5, 5, 30, 30, 30],
  [10, 15, 20, 48, 48, 48],
  [5, 5, 5, 30, 30, 30],
];
for (let filter = 0; filter < 5; filter++) test(`filter ${filter} restores exact RGB samples and opaque alpha`, async () => {
  const result = await decodePngPixels(png({ raw: [0, ...row0, filter, ...encodedRows[filter]], split: true }));
  assert.deepEqual(result, { width: 2, height: 2, rgba: expected });
});

test('RGBA retains hidden RGB, partial alpha, channel wraparound, and ICC bytes', async () => {
  const profile = Buffer.alloc(132);
  profile.writeUInt32BE(profile.length, 0); profile.write('mntr', 12); profile.write('RGB ', 16); profile.write('XYZ ', 20); profile.write('acsp', 36);
  const result = await decodePngPixels(new Blob([png({ width: 2, height: 1, color: 6,
    raw: [1, 250, 128, 9, 0, 16, 129, 248, 127],
    before: [chunk('iCCP', Buffer.concat([Buffer.from('Test profile\0\0'), deflateSync(profile)]))],
  })]));
  assert.deepEqual(result.rgba, Uint8Array.from([250, 128, 9, 0, 10, 1, 1, 127]));
  assert.deepEqual(result.iccProfile, new Uint8Array(profile));
});

test('RGB tRNS preserves transparent pixels without losing their RGB', async () => {
  const transparent = Buffer.from([0, 10, 0, 20, 0, 30]);
  const result = await decodePngPixels(png({ height: 1, raw: [0, ...row0], before: [chunk('tRNS', transparent)] }));
  assert.deepEqual(result.rgba, Uint8Array.from([10, 20, 30, 0, 50, 60, 70, 255]));
});

test('Paeth selects left, above and upper-left using exact tie rules', async () => {
  // Pixel one on row two is [50,30,60]; predictors for pixel two are [50,20,50].
  const result = await decodePngPixels(png({ raw: [0, 20, 50, 50, 50, 20, 40, 4, 30, 236, 10, 10, 20, 30] }));
  assert.deepEqual(result.rgba, Uint8Array.from([20, 50, 50, 255, 50, 20, 40, 255, 50, 30, 60, 255, 60, 40, 80, 255]));
});

test('valid unsupported grayscale, 16-bit RGB, indexed, and Adam7 images return null', async () => {
  const variants = [
    { width: 1, height: 1, color: 0, raw: [0, 31] },
    { width: 1, height: 1, depth: 16, raw: [0, 0, 1, 0, 2, 0, 3] },
    { width: 1, height: 1, color: 3, raw: [0, 0], before: [chunk('PLTE', Buffer.from([1, 2, 3]))] },
    { width: 1, height: 1, color: 6, interlace: 1, raw: [0, 1, 2, 3, 4] },
  ];
  for (const variant of variants) assert.equal(await decodePngPixels(png(variant)), null);
});

test('bad signature, CRC, truncation, missing end, and trailing bytes fail', async () => {
  const valid = png({ raw: [0, ...row0, 0, ...encodedRows[0]] });
  const badSignature = Buffer.from(valid); badSignature[0] = 0;
  const badCrc = Buffer.from(valid); badCrc[29] ^= 1;
  for (const bytes of [badSignature, badCrc, valid.subarray(0, 4), valid.subarray(0, 30), valid.subarray(0, -12), Buffer.concat([valid, Buffer.from([1])])]) await assert.rejects(decodePngPixels(bytes), /PNG screenshot:/);
});

test('corrupt deflate, wrong inflated length, and invalid scanline filters fail', async () => {
  const variants = [
    { compressed: Buffer.from([1, 2, 3]) },
    { raw: [0, ...row0] },
    { raw: [0, ...row0, 5, ...encodedRows[0]] },
    { raw: Buffer.alloc(128 * 1024) },
  ];
  for (const variant of variants) await assert.rejects(decodePngPixels(png(variant)), /PNG screenshot:/);
  await assert.rejects(decodePngPixels(png({ width: 1, height: 1, color: 0, raw: [7, 1] })), /unknown scanline filter/);
});

test('chunk ordering, forbidden transparency, invalid depth, and oversized dimensions fail', async () => {
  const variants = [
    { color: 6, raw: [0], before: [chunk('tRNS', Buffer.alloc(6))] },
    { color: 2, depth: 4, raw: [0] },
    { width: 40000001, height: 1, raw: [0] },
    { raw: [0, ...row0, 0, ...encodedRows[0]], after: [chunk('tEXt', Buffer.from('a\0b')), chunk('IDAT', deflateSync(Buffer.alloc(0)))] },
  ];
  for (const variant of variants) await assert.rejects(decodePngPixels(png(variant)), /PNG screenshot:/);
});

test('ICC decompression is bounded independently of the tiny image', async () => {
  const image = png({ height: 1, raw: [0, ...row0], before: [chunk('iCCP', Buffer.concat([Buffer.from('Test\0\0'), deflateSync(Buffer.alloc(4 * 1024 * 1024 + 1))]))] });
  await assert.rejects(decodePngPixels(image), /decompressed data exceeds/);
});
