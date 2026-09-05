import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const [base,output]=process.argv.slice(2);assert.ok(output.replaceAll('\\','/').includes('/offline-screenshots/'));
const {chromium}=await import(pathToFileURL('C:/Users/vikra/OneDrive/Documents/GitHub/gridatlas-main-202609050200/node_modules/playwright/index.mjs'));
await fs.mkdir(output,{recursive:true});const records=[];
for(const viewport of [{width:1400,height:900},{width:393,height:852}]){let browser;const record={viewport,preview:process.argv.includes('--preview')};
try{browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport});
if(record.preview){await page.route('**/source-browser/*',async route=>{const name=new URL(route.request().url()).pathname.split('/').at(-1);if(!['index.html','source-browser.css','source-browser.mjs'].includes(name))return route.continue();await route.fulfill({body:await fs.readFile('C:/Users/vikra/testcode-source-publication/sandbox/capsules/tool-layers/source-browser/'+name),contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'text/javascript'});});await page.route('**/layer-source-scopes.json',route=>route.fulfill({path:'C:/Users/vikra/OneDrive/Desktop/offline-screenshots/architecture-reload-20260905/next-fifty/source-scopes-preflight.json',contentType:'application/json'}));}
await page.goto(new URL('source-browser/index.html',base).href);await page.locator('#status').filter({hasText:'Choose a file'}).waitFor();
const apps=await page.locator('#tool option').evaluateAll(nodes=>nodes.map(n=>n.value));record.apps=[];
for(const id of apps){await page.locator('#tool').selectOption(id);const choices=await page.locator('#file option').evaluateAll(nodes=>nodes.map(n=>n.value));const entry=choices.find(p=>p.endsWith('/'+id+'/index.html'));assert.ok(entry);await page.locator('#file').selectOption(entry);await page.locator('#open').click();await page.locator('#status').filter({hasText:/^Verified /}).waitFor();assert.match(await page.locator('#source').innerText(),/<html/i);assert.equal(await page.locator('#source *').count(),0,'HTML source must remain text, never executable elements');record.apps.push({id,entry,verified:true});}
await page.screenshot({path:path.join(output,viewport.width+'-source-browser.png')});
const selected=await page.locator('#file').inputValue();await page.route('**/'+selected,route=>route.fulfill({body:'tampered',contentType:'text/plain'}));await page.locator('#open').click();await page.locator('#status').filter({hasText:'does not match the pinned inventory'}).waitFor();assert.equal(await page.locator('#source').innerText(),'');record.tamperedFileRefused=true;
await page.route('**/layer-source-scopes.json',route=>route.fulfill({body:JSON.stringify({schema:'ventus.layer-source-scopes.v1',apps:[{id:'broken'}]}),contentType:'application/json'}));await page.reload();await page.locator('#status').filter({hasText:'Invalid tool source record'}).waitFor();assert.equal(await page.locator('#open').isDisabled(),true);record.malformedIndexRefused=true;record.ok=true;
}catch(error){record.ok=false;record.error=String(error);}finally{await browser?.close();records.push(record);await fs.writeFile(path.join(output,'results.json'),JSON.stringify({base,records},null,2));console.log(JSON.stringify(record));}}
if(records.some(r=>!r.ok))process.exitCode=1;
