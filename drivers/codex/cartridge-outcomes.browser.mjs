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
    if(!['host.js','dismissal.js','focus-boundary.js','readiness.js'].includes(name))return route.continue();
    await route.fulfill({body:await fs.readFile(path.join('C:/Users/vikra/testcode-source-publication/sandbox/capsules/tool-layers',name)),contentType:'text/javascript'});
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
    if(tool.id==='gis-sld-financial-sandbox') {
     await frame.locator('#btn_draw').waitFor({state:'attached',timeout:60000});
     await frame.locator('#mod_wp').fill('665');
     await frame.locator('#mod_wp').press('Tab');
     await page.screenshot({path:path.join(output,`${viewport.width}-${tool.id}-open.png`)});
     await dialog.getByRole('button',{name:/Close.*return to GridAtlas/}).click();
     assert.deepEqual(await states(),beforePanel,'Closing tool altered Atlas layers');
     await page.locator('#codex-tool-layers').getByRole('button',{name:tool.title,exact:true}).click();
     assert.equal(await frame.locator('#mod_wp').inputValue(),'665','Reopening lost standalone app state');
    }
    if(tool.id==='module-layout') {
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
     record.cableCanvases=await frame.locator('canvas').evaluateAll(nodes=>nodes.map(canvas=>{const p=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let opaque=0;const colors=new Set();for(let i=0;i<p.length;i+=4){if(p[i+3])opaque++;colors.add(p[i]+','+p[i+1]+','+p[i+2]);}return {id:canvas.id,width:canvas.width,height:canvas.height,opaque,colors:colors.size};}));
     assert.equal(record.cableCanvases.length,3);
     assert.ok(record.cableCanvases.every(c=>c.opaque>100&&c.colors>4),'Cable canvases must contain drawn geometry');
     await page.screenshot({path:path.join(output,`${viewport.width}-${tool.id}-open.png`)});
    }
    if(process.argv.includes('--readiness')) {
     const ready=dialog.locator('[data-tool-readiness]');
     await ready.locator('xpath=self::*[@data-interface="loaded"]').waitFor({timeout:35000});
     const expected=tool.id==='gis-sld-financial-sandbox'?'unreported':'ready';
     await page.waitForFunction(({id,expected})=>document.querySelector('[data-tool-readiness="'+id+'"]')?.dataset.drawing===expected,{id:tool.id,expected},{timeout:35000});
    }
    if(process.argv.includes('--focus')) {
     const close=dialog.getByRole('button',{name:/Close.*return to GridAtlas/});
     await close.focus();await page.keyboard.press('Tab');
     const toolFrame=page.frames().find(f=>f.url().includes(tool.id+'/index.html'));
     assert.ok(await toolFrame.evaluate(()=>document.activeElement!==document.body),'Tab must enter tool');
     await page.keyboard.press('Shift+Tab');
     assert.equal(await close.evaluate(n=>n===document.activeElement),true,'Shift Tab must return to close');
     await page.keyboard.press('Shift+Tab');
     assert.ok(await toolFrame.evaluate(()=>document.activeElement!==document.body),'Reverse Tab must enter end of tool');
     await page.keyboard.press('Tab');
     assert.equal(await close.evaluate(n=>n===document.activeElement),true,'Last tool control must wrap to close');
    }
    if(process.argv.includes('--escape')) {
     await frame.locator('body').press('Escape');
     await dialog.waitFor({state:'hidden'});
     assert.equal(await page.locator('#codex-tool-layers').getByRole('button',{name:tool.title,exact:true}).evaluate(n=>n===document.activeElement),true,'Escape must return focus');
     assert.deepEqual(await states(),beforePanel,'Escape changed Atlas layers');
    } else await dialog.getByRole('button',{name:/Close.*return to GridAtlas/}).click();
    record.tools.push({id:tool.id,opened:true,closed:true,escape:process.argv.includes('--escape'),focusBoundary:process.argv.includes('--focus'),readiness:process.argv.includes('--readiness')});
   }
  } else if(Number(release.generation)>=202609051850) {
   await page.locator('.neon-layout').first().waitFor({state:'attached',timeout:30000});
   await page.locator('#codex-layout-command button').click();
   await page.getByText('Layout sandbox',{exact:false}).first().waitFor({state:'visible',timeout:30000});
   record.layoutOpened=true;
  }
  record.layerStates=await states();record.ok=true;
  await page.screenshot({path:path.join(output,`${viewport.width}-controls.png`),fullPage:false});
 } catch(error) {record.ok=false;record.error=String(error);if(page){record.failureControls=await page.locator('input[data-layer-id="subs"]').evaluateAll(nodes=>nodes.map(n=>({parent:n.closest('[id]')?.id,checked:n.checked,connected:n.isConnected}))).catch(()=>null);await page.screenshot({path:path.join(output,`${viewport.width}-failure.png`)}).catch(()=>{});}}
 finally {await browser?.close();records.push(record);await fs.writeFile(path.join(output,'results.json'),JSON.stringify({base,records},null,2));console.log(JSON.stringify(record));}
}
if(records.some(r=>!r.ok))process.exitCode=1;
