/** Actual installed-Chrome UI proof for the extracted controls. Artifacts stay offline. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const base=process.argv[2], output=process.argv[3];
assert.ok(base && output && output.replaceAll('\\','/').includes('/offline-screenshots/'));
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || 'C:/Users/vikra/OneDrive/Documents/GitHub/gridatlas-main-202609050200/node_modules/playwright/index.mjs'));
const release=await (await fetch(new URL('release.json',base))).json();
const toolsResponse=await fetch(new URL('atlas/tool-layers.json',base));
const toolConfig=toolsResponse.ok && toolsResponse.headers.get('content-type')?.includes('json') ? await toolsResponse.json() : null;
const records=[];await fs.mkdir(output,{recursive:true});
for(const viewport of [{width:1400,height:900},{width:393,height:852}]) {
 let browser,page;const record={viewport,generation:release.generation,engineCommit:release.teleprinter.commit};
 try {
  browser=await chromium.launch({channel:'chrome',headless:true});
  page=await browser.newPage({viewport,deviceScaleFactor:viewport.width===393?2:1});
  if(process.argv.includes('--local-tool-capsules')) {
   record.localToolCapsules=true;
   await page.route('**/tool-layers/*.js',async route=>{
    const name=new URL(route.request().url()).pathname.split('/').at(-1);
    if(!['host.js','dismissal.js','focus-boundary.js','readiness.js','viewport.js','session-restart.js','recovery.js','navigation.js'].includes(name))return route.continue();
    await route.fulfill({body:await fs.readFile(path.join('C:/Users/vikra/testcode-source-publication/sandbox/capsules/tool-layers',name)),contentType:'text/javascript'});
   });
  }
  if(process.argv.includes('--navigation-preview')) {
   record.navigationPreview=true;
   const {buildNavigationRegistry}=await import(pathToFileURL('C:/Users/vikra/testcode-source-publication/sandbox/capsules/tool-layers/registry.mjs'));
   toolConfig.navigation=buildNavigationRegistry(toolConfig);
   await page.route('**/atlas/teleprinter-bootstrap.js',async route=>{const response=await route.fetch();const body=(await response.text()).replace(/mountToolLayers\([^\n]+/,`mountToolLayers(${JSON.stringify(toolConfig.tools)}, import.meta.url, ${JSON.stringify(toolConfig.navigation)});`);await route.fulfill({response,body});});
  }
  if(process.argv.includes('--recover')) {
   record.recoveryFaultInjection=true;let injected=false;
   await page.route('**/module-layout/index.html',route=>{
    if(injected)return route.continue();injected=true;return route.fulfill({status:404,contentType:'text/html',body:'<!doctype html><html><body>Injected missing tool</body></html>'});
   });
  }
  let releaseModuleStyle;
  if(process.argv.includes('--module-preview')) {
   record.moduleProducerPreview=true;
   const root='C:/Users/vikra/OneDrive/Documents/GitHub/layout-tool';
   const pointer=JSON.parse(await fs.readFile(path.join(root,'derived-latest.json'),'utf8'));
   const producer=path.join(root,'releases',pointer.generation,'solar-bess-topology-v7/module-layout');
   await page.route('**/module-layout/*',async route=>{
    const name=new URL(route.request().url()).pathname.split('/').at(-1);
    if(!/^[a-zA-Z0-9_.-]+$/.test(name))return route.continue();
    try {await route.fulfill({body:await fs.readFile(path.join(producer,name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'text/javascript'});}catch{return route.continue();}
   });
  }
  if(process.argv.includes('--cable-preview')) {
   record.cableProducerPreview=true;
   const root='C:/Users/vikra/OneDrive/Documents/GitHub/cable-trench-or-drill';
   const pointer=JSON.parse(await fs.readFile(path.join(root,'derived-latest.json'),'utf8'));
   const producer=path.join(root,'releases',pointer.generation,'solar-bess-topology-v7/cable-geometry-visualiser');
   await page.route('**/cable-geometry-visualiser/*',async route=>{
    const name=new URL(route.request().url()).pathname.split('/').at(-1);
    if(!/^[a-zA-Z0-9_.-]+$/.test(name))return route.continue();
    try {await route.fulfill({body:await fs.readFile(path.join(producer,name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'text/javascript'});}catch{return route.continue();}
   });
  }
  if(process.argv.includes('--gis-preview')) {
   record.gisProducerPreview=true;
   const root='C:/Users/vikra/OneDrive/Documents/GitHub/gis-sld-sandbox';
   const pointer=JSON.parse(await fs.readFile(path.join(root,'derived-latest.json'),'utf8'));
   const producer=path.join(root,'releases',pointer.generation,'solar-bess-topology-v7/gis-sld-financial-sandbox');
   await page.route('**/gis-sld-financial-sandbox/*',async route=>{
    const name=new URL(route.request().url()).pathname.split('/').at(-1);
    if(!/^[a-zA-Z0-9_.-]+$/.test(name))return route.continue();
    try {await route.fulfill({body:await fs.readFile(path.join(producer,name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'text/javascript'});}catch{return route.continue();}
   });
  }
  if(process.argv.includes('--guard')) {
   record.moduleStyleGate=true;const gate=new Promise(resolve=>releaseModuleStyle=resolve);
   await page.route('https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',async route=>{
    if(route.request().frame().url().includes('/module-layout/'))await gate;
    await route.continue();
   });
  }
  await page.goto(new URL('atlas/?repd_ref=1938&technology=solar',base).href,{waitUntil:'domcontentloaded'});
  await page.getByText(/TEST CODE repd-1938 \| ENGINE COMPLETED/).first().waitFor({timeout:90000});
  const grid=page.locator('#codex-layer-quick-controls [data-layer-command="grid"]');
  const subs=page.locator('#codex-layer-quick-controls [data-layer-command="subs"]');
  await grid.waitFor({state:'visible',timeout:60000});
  await page.waitForFunction(()=>!document.querySelector('[data-layer-command="grid"]')?.disabled,null,{timeout:60000});
  const states=()=>page.evaluate(()=>Object.fromEntries(['400','275','220','132','66','subs'].map(id=>[id,document.querySelector('#scada-ui-container input[data-layer-id="'+id+'"]')?.checked])));
  const panel=page.locator('.scada-wrapper');
  if(Number(release.generation)>=202609051848) assert.equal(await panel.getAttribute('data-gridatlas-collapsed'),'1','Layers must start collapsed');
  await page.waitForFunction(()=>{const value=JSON.stringify([...document.querySelectorAll('#scada-ui-container input[data-layer-id]')].map(n=>[n.dataset.layerId,n.checked]));const now=performance.now();const previous=window.__controlReadiness;if(!previous||previous.value!==value){window.__controlReadiness={value,since:now};return false;}return now-previous.since>=500;},null,{timeout:15000,polling:100});
  const first=await states();
  // Normalise through the real group button, then prove both directions.
  if(['400','275','220','132','66'].every(id=>first[id])) await grid.click();
  await grid.click();const enabled=await states();
  assert.ok(['400','275','220','132','66'].every(id=>enabled[id]));
  await grid.click();const disabled=await states();
  assert.ok(['400','275','220','132','66'].every(id=>!disabled[id]));
  record.beforeSubs=disabled;await subs.click();await page.waitForFunction(expected=>document.querySelector('#scada-ui-container input[data-layer-id="subs"]')?.checked===expected,!disabled.subs,{timeout:5000});const subChanged=await states();assert.notEqual(subChanged.subs,disabled.subs);
  assert.ok(['400','275','220','132','66'].every(id=>subChanged[id]===disabled[id]));
  await grid.click();
  const beforePanel=await states();
  const toggle=page.locator('#gridatlas-dash-toggle');await toggle.click();await toggle.click();
  assert.deepEqual(await states(),beforePanel,'Panel visibility changed enabled layers');
  const bounds=await page.locator('#codex-layer-quick-controls').boundingBox(),map=await page.locator('#map-container').boundingBox();
  assert.ok(bounds.x>=map.x && bounds.x<map.x+40 && bounds.y+bounds.height<=map.y+map.height+2,'Quick controls must stay bottom-left within map');
  assert.ok(bounds.y>map.y+map.height/2);record.quickControlBounds=bounds;
  if(toolConfig) {
   record.tools=[];
   for(const tool of toolConfig.tools) {
    await page.locator('#codex-tool-layers').getByRole('button',{name:tool.title,exact:true}).click();
    const dialog=page.getByRole('dialog',{name:tool.title,exact:true});
    await dialog.waitFor({state:'visible'});
    const frame=dialog.frameLocator('iframe');
    if(process.argv.includes('--recover') && tool.id==='module-layout') {
     const retry=dialog.getByRole('button',{name:'Retry tool loading',exact:true});await retry.waitFor({state:'visible',timeout:10000});
     await page.screenshot({path:path.join(output,`${viewport.width}-injected-load-failure.png`)});
     await retry.click();assert.equal(await frame.getByText('Injected missing tool',{exact:true}).count(),1,'Retry must request confirmation before navigation');
     await Promise.all([page.waitForEvent('framenavigated',{predicate:f=>f.url().includes('/module-layout/index.html')}),dialog.getByRole('button',{name:'Confirm restart',exact:true}).click()]);
     await retry.waitFor({state:'hidden',timeout:10000});
    }

    if(tool.id==='gis-sld-financial-sandbox') {
     await frame.locator('#btn_draw').waitFor({state:'attached',timeout:60000});
     if(process.argv.includes('--route-state')) {
      const realm=page.frames().find(f=>f.url().includes('/gis-sld-financial-sandbox/index.html'));
      await realm.waitForFunction(()=>typeof map!=='undefined'&&map?.isStyleLoaded()&&map.getSource('topology'),null,{timeout:60000});
      assert.equal(await realm.evaluate(()=>GisSldRoute.getSnapshot().status),'empty');
      await frame.locator('#btn_draw').click();
      await realm.waitForFunction(()=>GisSldRoute.getSnapshot().status==='available',null,{timeout:15000});
      const direct=await realm.evaluate(()=>GisSldRoute.getSnapshot());assert.equal(direct.route.geometry.coordinates.length,2);
      await frame.locator('#btn_map_drop_pins').click();
      assert.equal(await realm.evaluate(()=>GisSldRoute.getSnapshot().status),'editing');
      assert.equal(await realm.evaluate(()=>GisSldRoute.getSnapshot().route),null);
      const canvas=frame.locator('#map canvas');await canvas.scrollIntoViewIfNeeded();
      const points=await canvas.evaluate(canvas=>{const r=canvas.getBoundingClientRect(),hits=[];for(let y=Math.max(r.top+20,20);y<Math.min(r.bottom-20,innerHeight-20);y+=30)for(let x=Math.max(r.left+20,20);x<Math.min(r.right-20,innerWidth-20);x+=30)if(document.elementFromPoint(x,y)===canvas)hits.push({x:x-r.left,y:y-r.top});return hits;});
      assert.ok(points.length>=2,'The original map must expose space for route drawing');
      await canvas.click({position:points[Math.floor(points.length*.3)]});
      await canvas.click({position:points[Math.floor(points.length*.7)]});
      await frame.locator('#btn_map_draw_route').click();
      const manual=await realm.evaluate(()=>GisSldRoute.getSnapshot());
      assert.equal(manual.status,'available');assert.equal(manual.pins.length,2);assert.equal(manual.route.geometry.coordinates.length,4);assert.equal(manual.committed,true);
      assert.equal(await realm.evaluate(()=>{const snapshot=GisSldRoute.getSnapshot();const original=JSON.stringify(state.currentGeoJSON);try{snapshot.route.geometry.coordinates[0][0]=0;}catch{}return Object.isFrozen(snapshot.route.geometry.coordinates[0])&&original===JSON.stringify(state.currentGeoJSON);}),true,'Read-only adapter must not expose mutable original state');
      await page.screenshot({path:path.join(output,`${viewport.width}-manual-route.png`)});
      await frame.locator('#btn_map_clear_route').click();const cleared=await realm.evaluate(()=>GisSldRoute.getSnapshot());assert.equal(cleared.pins.length,0);assert.equal(cleared.route.geometry.coordinates.length,2);
      record.gisRoute={direct,manual,clearRestoresDirect:true,immutableCopy:true};
     }
     await frame.locator('#mod_wp').fill('665');
     await frame.locator('#mod_wp').press('Tab');
     await page.screenshot({path:path.join(output,`${viewport.width}-${tool.id}-open.png`)});
     await dialog.getByRole('button',{name:/Close.*return to GridAtlas/}).click();
     assert.deepEqual(await states(),beforePanel,'Closing tool altered Atlas layers');
     await page.locator('#codex-tool-layers').getByRole('button',{name:tool.title,exact:true}).click();
     assert.equal(await frame.locator('#mod_wp').inputValue(),'665','Reopening lost standalone app state');
    }
    if(tool.id==='module-layout') {
     if(process.argv.includes('--guard')) {
      await frame.locator('#ml-draw-readiness[data-ready="false"]').waitFor({timeout:15000});
      assert.equal(await frame.locator('#ml_draw_center').isDisabled(),true);
      assert.equal(await frame.locator('#ml_pick_site').isDisabled(),true);
      const realm=page.frames().find(f=>f.url().includes('/module-layout/index.html'));
      const state=()=>realm.evaluate(()=>({centre:mlState.centre,pickMode:mlState.pickMode,features:mlState.currentGeoJSON.features.length}));
      const before=await state();await frame.locator('#ml_draw_center').dispatchEvent('click');await frame.locator('#ml_pick_site').dispatchEvent('click');
      assert.deepEqual(await state(),before,'Blocked draw or pick changed original state');
      await page.screenshot({path:path.join(output,`${viewport.width}-guard-pending.png`)});
      releaseModuleStyle();await frame.locator('#ml-draw-readiness[data-ready="true"]').waitFor({timeout:60000});
      assert.equal(await frame.locator('#ml_draw_center').isDisabled(),false);record.moduleGuard={blockedEarly:true,originalStatePreserved:true,enabledAfterMap:true};
     }
     await frame.locator('#ml_status').filter({hasText:'Ready. Draw at map centre or pick a site.'}).waitFor({timeout:60000});
     await frame.locator('#ml_total_modules').fill('120');
     await frame.locator('#ml_modules_per_row').fill('20');
     await frame.locator('#ml_draw_center').click();
     await frame.locator('#ml_out_rows').filter({hasText:/^6$/}).waitFor({timeout:15000});
     assert.equal((await frame.locator('#ml_out_rows').innerText()).trim(),'6');
     assert.equal((await frame.locator('#ml_out_rendered').innerText()).trim(),'120');
     await page.screenshot({path:path.join(output,`${viewport.width}-${tool.id}-open.png`)});
    }
    if(tool.id==='cable-geometry-visualiser') {
     await frame.locator('#route_name').fill('Chrome integration test');
     await frame.locator('#route_name').press('Tab');
     assert.ok((await frame.locator('#status_box').innerText()).length>0);
     const drawingFrame=page.frames().find(f=>f.url().includes('/cable-geometry-visualiser/index.html'));
     await drawingFrame.waitForFunction(()=>{const canvases=[...document.querySelectorAll('canvas')];return canvases.length===3&&canvases.every(c=>{const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;for(let i=3;i<data.length;i+=4)if(data[i])return true;return false;});},null,{timeout:15000,polling:200});
     if(process.argv.includes('--cable-signal')) {
      const ready=()=>drawingFrame.waitForFunction(()=>window.CableGeometryRender?.getState().state==='ready',null,{timeout:15000});
      await ready();
      await frame.locator('#route_name').fill('Route readiness regression');await ready();
      const beforeBlur=await drawingFrame.evaluate(()=>CableGeometryRender.getState());
      await frame.locator('#route_name').press('Tab');
      assert.equal(await drawingFrame.evaluate(()=>CableGeometryRender.getState().state),'ready','Route-name blur must not invent a pending render');
      const revision=beforeBlur.revision;
      const pending=await drawingFrame.evaluate(()=>{const el=document.getElementById('circuit_qty');el.value='8';el.dispatchEvent(new Event('input',{bubbles:true}));return CableGeometryRender.getState().state;});
      assert.equal(pending,'pending');await ready();
      const signal=await drawingFrame.evaluate(async()=>{const text=document.getElementById('snapshot_box').textContent;const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');return {state:CableGeometryRender.getState(),hash,input:document.getElementById('circuit_qty').value};});
      assert.equal(signal.state.snapshotSha256,signal.hash);assert.ok(signal.state.revision>revision);assert.equal(signal.input,'8');
      await frame.locator('#circuit_qty').dispatchEvent('input');await ready();
      assert.ok(await drawingFrame.evaluate(previous=>CableGeometryRender.getState().revision>previous,signal.state.revision),'An identical-value redraw still advances the render revision');
      record.cableSignal={routeNameBlurStable:true,pendingBeforeRender:true,snapshotHashMatched:true,repeatRenderAdvanced:true,receipt:signal.state};
     }
     record.cableCanvases=await frame.locator('canvas').evaluateAll(nodes=>nodes.map(canvas=>{const p=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let opaque=0;const colors=new Set();for(let i=0;i<p.length;i+=4){if(p[i+3])opaque++;colors.add(p[i]+','+p[i+1]+','+p[i+2]);}return {id:canvas.id,width:canvas.width,height:canvas.height,opaque,colors:colors.size};}));
     assert.equal(record.cableCanvases.length,3);
     assert.ok(record.cableCanvases.every(c=>c.opaque>100&&c.colors>4),'Cable canvases must contain drawn geometry');
     await page.screenshot({path:path.join(output,`${viewport.width}-${tool.id}-open.png`)});
    }
    if(process.argv.includes('--viewport')) {
     const boxes=await dialog.evaluate(layer=>Object.fromEntries(['header','strong','[data-tool-readiness]','header button','iframe'].map(selector=>{const r=layer.querySelector(selector).getBoundingClientRect();return [selector,{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}];})));
     for(const box of Object.values(boxes))assert.ok(box.x>=0&&box.right<=viewport.width+1,'Tool header or frame overflows horizontally');
     assert.ok(boxes.iframe.height>100&&boxes.iframe.bottom<=viewport.height+1,'Tool iframe must fit viewport');
     assert.ok(boxes['header button'].height>=44,'Close target must stay touch sized');
     assert.ok(boxes.strong.right<=boxes['header button'].x,'Title and close must not overlap');
    }
    if(process.argv.includes('--readiness')) {
     const ready=dialog.locator('[data-tool-readiness]');
     await ready.locator('xpath=self::*[@data-interface="loaded"]').waitFor({timeout:35000});
     const expected=tool.id==='gis-sld-financial-sandbox'?'unreported':'ready';
     await page.waitForFunction(({id,expected})=>document.querySelector('[data-tool-readiness="'+id+'"]')?.dataset.drawing===expected,{id:tool.id,expected},{timeout:35000});
    }
    if(process.argv.includes('--focus')) {
     const close=dialog.getByRole('button',{name:/Close.*return to GridAtlas/});
     const lastHeader=dialog.locator('header button:visible').last();
     await lastHeader.focus();await page.keyboard.press('Tab');
     const toolFrame=page.frames().find(f=>f.url().includes(tool.id+'/index.html'));
     assert.ok(await toolFrame.evaluate(()=>document.activeElement!==document.body),'Tab must enter tool');
     await page.keyboard.press('Shift+Tab');
     assert.equal(await lastHeader.evaluate(n=>n===document.activeElement),true,'Shift Tab must return to last header control');
     await close.focus();await page.keyboard.press('Shift+Tab');
     assert.ok(await toolFrame.evaluate(()=>document.activeElement!==document.body),'Reverse Tab must enter end of tool');
     await page.keyboard.press('Tab');
     assert.equal(await close.evaluate(n=>n===document.activeElement),true,'Last tool control must wrap to close');
    }
    if(process.argv.includes('--restart') && tool.id==='module-layout') {
     await dialog.getByRole('button',{name:'Restart tool',exact:true}).click();
     await dialog.getByRole('button',{name:/Close.*return to GridAtlas/}).click();
     await page.locator('#codex-tool-layers').getByRole('button',{name:tool.title,exact:true}).click();
     assert.equal(await dialog.getByRole('button',{name:'Confirm restart',exact:true}).count(),0,'Reopening must clear armed restart');
     await dialog.getByRole('button',{name:'Restart tool',exact:true}).click();
     await dialog.getByRole('button',{name:'Keep working',exact:true}).click();
     assert.equal(await frame.locator('#ml_total_modules').inputValue(),'120','Cancel restart must keep work');
     await dialog.getByRole('button',{name:'Restart tool',exact:true}).click();
     await Promise.all([page.waitForEvent('framenavigated',{predicate:f=>f.url().includes('/module-layout/index.html')}),dialog.getByRole('button',{name:'Confirm restart',exact:true}).click()]);
     await frame.locator('#ml_status').filter({hasText:'Ready. Draw at map centre or pick a site.'}).waitFor({timeout:60000});
     assert.equal(await frame.locator('#ml_total_modules').inputValue(),'1200','Confirmed restart must restore original session');
     const gis=page.frames().find(f=>f.url().includes('/gis-sld-financial-sandbox/index.html'));
     assert.equal(await gis.locator('#mod_wp').inputValue(),'665','Restarting Module must retain GIS work');
     assert.deepEqual(await states(),beforePanel,'Restarting tool changed Atlas');
    }
    if(process.argv.includes('--escape')) {
     await frame.locator('body').press('Escape');
     await dialog.waitFor({state:'hidden'});
     assert.equal(await page.locator('#codex-tool-layers').getByRole('button',{name:tool.title,exact:true}).evaluate(n=>n===document.activeElement),true,'Escape must return focus');
     assert.deepEqual(await states(),beforePanel,'Escape changed Atlas layers');
    } else await dialog.getByRole('button',{name:/Close.*return to GridAtlas/}).click();
    record.tools.push({id:tool.id,opened:true,closed:true,escape:process.argv.includes('--escape'),focusBoundary:process.argv.includes('--focus'),readiness:process.argv.includes('--readiness'),viewport:process.argv.includes('--viewport'),restart:process.argv.includes('--restart')&&tool.id==='module-layout',recovery:process.argv.includes('--recover')&&tool.id==='module-layout'});
   }
  } else if(Number(release.generation)>=202609051850) {
   await page.locator('.neon-layout').first().waitFor({state:'attached',timeout:30000});
   await page.locator('#codex-layout-command button').click();
   await page.getByText('Layout sandbox',{exact:false}).first().waitFor({state:'visible',timeout:30000});
   record.layoutOpened=true;
  }
  if(process.argv.includes('--navigation')) {
   const navigationLayers=await states();
   await page.locator('#codex-tool-layers').getByRole('button',{name:'Cable Geometry',exact:true}).click();
   const cableDialog=page.getByRole('dialog',{name:'Cable Geometry',exact:true});
   await cableDialog.frameLocator('iframe').getByRole('link',{name:/^Module Layout V7$/i}).click();
   const linked=page.getByRole('dialog',{name:'Module Layout',exact:true}).filter({visible:true});
   await linked.waitFor({state:'visible'});const linkedFrame=linked.frameLocator('iframe');
   const owner=JSON.parse(await linked.getAttribute('data-current-owner'));assert.equal(owner.commit,toolConfig.tools.find(t=>t.id==='module-layout').owner.commit);
   await linkedFrame.locator('#ml_total_modules').fill('321');
   await linked.getByRole('button',{name:'Restart tool',exact:true}).click();await linked.getByRole('button',{name:'Confirm restart',exact:true}).click();
   await linkedFrame.locator('#ml_total_modules').waitFor();assert.equal(await linkedFrame.locator('#ml_total_modules').inputValue(),'1200','Restart must stay on navigated Module');
   await linkedFrame.getByRole('link',{name:'DC AC LV Topology Review',exact:true}).click();
   const dc=page.getByRole('dialog',{name:'DC/AC LV Topology Review',exact:true});await dc.waitFor({state:'visible'});
   assert.equal(JSON.parse(await dc.getAttribute('data-current-owner')).commit,toolConfig.navigation.find(t=>t.id==='dc-ac-lv-topology-review').owner.commit);
   assert.equal(await dc.locator('[data-tool-readiness]').getAttribute('data-drawing'),'unreported');
   await page.screenshot({path:path.join(output,`${viewport.width}-sibling-navigation.png`)});
   await dc.getByRole('button',{name:/Close.*return to GridAtlas/}).click();assert.deepEqual(await states(),navigationLayers);
   record.siblingNavigation={moduleOwner:owner,currentDocumentRestart:true,dcOwnerResolved:true,atlasRetained:true};
  }
  record.layerStates=await states();record.ok=true;
  await page.screenshot({path:path.join(output,`${viewport.width}-controls.png`),fullPage:false});
 } catch(error) {record.ok=false;record.error=String(error);if(page){record.failureControls=await page.locator('input[data-layer-id="subs"]').evaluateAll(nodes=>nodes.map(n=>({parent:n.closest('[id]')?.id,checked:n.checked,connected:n.isConnected}))).catch(()=>null);await page.screenshot({path:path.join(output,`${viewport.width}-failure.png`)}).catch(()=>{});}}
 finally {await browser?.close();records.push(record);await fs.writeFile(path.join(output,'results.json'),JSON.stringify({base,records},null,2));console.log(JSON.stringify(record));}
}
if(records.some(r=>!r.ok))process.exitCode=1;
