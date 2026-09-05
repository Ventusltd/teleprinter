import test from 'node:test';
import assert from 'node:assert/strict';
import {GRID_LAYER_IDS, toggleLayerGroup} from './layer-quick-controls.js';
const box = checked => ({checked, clicks:0, click(){this.checked=!this.checked;this.clicks++;}});
test('grid contract contains all five actual voltages',()=>assert.deepEqual([...GRID_LAYER_IDS],['400','275','220','132','66']));
test('mixed state enables group through existing click handlers, then disables it',()=>{
  const boxes=[box(true),box(false),box(false)]; toggleLayerGroup(boxes);
  assert.ok(boxes.every(b=>b.checked)); assert.equal(boxes[0].clicks,0);
  toggleLayerGroup(boxes); assert.ok(boxes.every(b=>!b.checked));
});
test('independent substation toggle leaves grid state alone',()=>{
  const grid=[box(true)], subs=[box(false)]; toggleLayerGroup(subs);
  assert.equal(subs[0].checked,true); assert.equal(grid[0].clicks,0);
  assert.doesNotThrow(()=>toggleLayerGroup([]));
});
