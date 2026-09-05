/** Actual installed-Chrome UI proof for the extracted controls. Artifacts stay offline. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const base=process.argv[2], output=process.argv[3];
assert.ok(base && output && output.replaceAll('\\','/').includes('/offline-screenshots/'));
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || 'C:/Users/vikra/OneDrive/Documents/GitHub/gridatlas-main-202609050200/node_modules/playwright/index.mjs'));
const release=await (await fetch(new URL('release.json',base))).json();
const records=[];await fs.mkdir(output,{recursive:true});
for(const viewport of [{width:1400,height:900},{width:393,height:852}]) {
 let browser;const record={viewport,generation:release.generation,engineCommit:release.teleprinter.commit};
 try {
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport,deviceScaleFactor:viewport.width===393?2:1});
  await page.goto(new URL('atlas/?repd_ref=1938&technology=solar',base).href,{waitUntil:'domcontentloaded'});
  await page.getByText(/TEST CODE repd-1938 \| ENGINE COMPLETED/).first().waitFor({timeout:90000});
  const grid=page.locator('#codex-layer-quick-controls [data-layer-command="grid"]');
  const subs=page.locator('#codex-layer-quick-controls [data-layer-command="subs"]');
  await grid.waitFor({state:'visible',timeout:60000});
  await page.waitForFunction(()=>!document.querySelector('[data-layer-command="grid"]')?.disabled,{timeout:60000});
  const states=()=>page.evaluate(()=>Object.fromEntries(['400','275','220','132','66','subs'].map(id=>[id,document.querySelector('#scada-ui-container input[data-layer-id="'+id+'"]')?.checked])));
  const panel=page.locator('.scada-wrapper');
  if(Number(release.generation)>=202609051848) assert.equal(await panel.getAttribute('data-gridatlas-collapsed'),'1','Layers must start collapsed');
  const first=await states();
  // Normalise through the real group button, then prove both directions.
  if(['400','275','220','132','66'].every(id=>first[id])) await grid.click();
  await grid.click();const enabled=await states();
  assert.ok(['400','275','220','132','66'].every(id=>enabled[id]));
  await grid.click();const disabled=await states();
  assert.ok(['400','275','220','132','66'].every(id=>!disabled[id]));
  await subs.click();const subChanged=await states();assert.notEqual(subChanged.subs,disabled.subs);
  assert.ok(['400','275','220','132','66'].every(id=>subChanged[id]===disabled[id]));
  await grid.click();
  const beforePanel=await states();
  const toggle=page.locator('#gridatlas-dash-toggle');await toggle.click();await toggle.click();
  assert.deepEqual(await states(),beforePanel,'Panel visibility changed enabled layers');
  const bounds=await page.locator('#codex-layer-quick-controls').boundingBox(),map=await page.locator('#map-container').boundingBox();
  assert.ok(bounds.x>=map.x && bounds.x<map.x+40 && bounds.y+bounds.height<=map.y+map.height+2,'Quick controls must stay bottom-left within map');
  assert.ok(bounds.y>map.y+map.height/2);record.quickControlBounds=bounds;
  if(Number(release.generation)>=202609051850) {
   await page.locator('.neon-layout').first().waitFor({state:'attached',timeout:30000});
   await page.locator('#codex-layout-command button').click();
   await page.getByText('Layout sandbox',{exact:false}).first().waitFor({state:'visible',timeout:30000});
   record.layoutOpened=true;
  }
  record.layerStates=await states();record.ok=true;
  await page.screenshot({path:path.join(output,`${viewport.width}-controls.png`),fullPage:false});
 } catch(error) {record.ok=false;record.error=String(error);}
 finally {await browser?.close();records.push(record);await fs.writeFile(path.join(output,'results.json'),JSON.stringify({base,records},null,2));console.log(JSON.stringify(record));}
}
if(records.some(r=>!r.ok))process.exitCode=1;
