import test from 'node:test';
import assert from 'node:assert/strict';
import {collapseInitialLayers} from './layers-panel-policy.js';
test('arrival uses existing panel action without touching map layer inputs',()=>{
  let collapsed=false,clicks=0;
  const doc={documentElement:{dataset:{}},querySelector(selector){assert.equal(selector,'.scada-wrapper');return {getAttribute:()=>collapsed?'1':null};},getElementById(id){assert.equal(id,'gridatlas-dash-toggle');return {click(){collapsed=true;clicks++;}};}};
  assert.equal(collapseInitialLayers(doc),true);assert.equal(clicks,1);
  collapseInitialLayers(doc);assert.equal(clicks,1);
  assert.equal(doc.documentElement.dataset.codexLayersArrival,'collapsed');
});
test('late controls remain pending instead of hiding the map wrapper',()=>{
  assert.equal(collapseInitialLayers({querySelector:()=>null,getElementById:()=>null}),false);
});
