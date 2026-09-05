import test from 'node:test';
import assert from 'node:assert/strict';
import {captureGeometry, assertStableGeometry} from './capture-geometry.mjs';
test('fractional display scaling retains the renderer backing size', () => {
  const g = captureGeometry(2048, 972, 1.875);
  assert.equal(g.pixelWidth,3840); assert.equal(g.pixelHeight,1822);
  assert.doesNotThrow(()=>assertStableGeometry(g,g,{width:3840,height:1822}));
});
test('odd viewport sizes and common scaling factors agree with canvas floor semantics',()=>{
  for(const ratio of [1,1.25,1.5,1.875,2,3]) {
    const g=captureGeometry(393,853,ratio);
    assert.equal(g.pixelWidth,Math.floor(393*ratio)); assert.equal(g.pixelHeight,Math.floor(853*ratio));
  }
});
test('real resize and wrong frame remain failures',()=>{
  const g=captureGeometry(393,853,2);
  assert.throws(()=>assertStableGeometry(g,captureGeometry(394,853,2),{width:786,height:1706}),/resized/);
  assert.throws(()=>assertStableGeometry(g,g,{width:785,height:1706}),/unexpected/);
  assert.throws(()=>captureGeometry(10000,10000,3),/large/);
});
