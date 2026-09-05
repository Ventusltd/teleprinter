import test from 'node:test';
import assert from 'node:assert/strict';
import {selectedLayoutControl} from './layout-command.js';
test('layout resolves an existing selected-project action, not a grid toggle',()=>{
  const dead={isConnected:false}, disabled={isConnected:true,disabled:true}, action={isConnected:true,disabled:false};
  assert.equal(selectedLayoutControl({querySelectorAll(selector){assert.equal(selector,'.neon-layout');return [dead,disabled,action];}}),action);
});
test('no selection has no implicit calculation or layer action',()=>assert.equal(selectedLayoutControl({querySelectorAll:()=>[]}),null));
