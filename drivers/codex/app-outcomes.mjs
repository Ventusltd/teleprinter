/** Historical launcher check for 202609051419. New menu-only builds use
 * file-print-compatibility.mjs and fifty-prints.mjs. Downloads are deleted. */
import {pathToFileURL,fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {attachScreenCapture,clickAndReadDownload} from './driver.mjs';
const {chromium,firefox,webkit}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const base=process.argv[2];
if(!base) throw new Error('Supply the served generation URL.');
const here=path.dirname(fileURLToPath(import.meta.url));
const results=[];
for(const [name,type,options,viewport] of [
 ['Chrome',chromium,{channel:'chrome'},{width:1400,height:900}],
 ['Firefox',firefox,{},{width:1200,height:800}],
 ['WebKit mobile emulation',webkit,{},{width:393,height:852}]
]) {
 if(process.env.TELEPRINTER_BROWSER && name!==process.env.TELEPRINTER_BROWSER) continue;
 const browser=await type.launch({headless:true,...options});
 try {
  for(const route of ['','pipeline/','atlas/?repd_ref=2484&technology=wind_offshore']) {
   const context=await browser.newContext({viewport,acceptDownloads:true});
   const page=await context.newPage(); let captured;
   try {
    await attachScreenCapture(page,{onCapture:png=>{captured=png;}});
    await page.goto(new URL(route,base).href,{waitUntil:'domcontentloaded',timeout:60000});
    await page.getByRole('button',{name:'Teleprinter',exact:true}).waitFor({timeout:90000});
    if(route.startsWith('pipeline')) await page.locator('#tbody tr').first().waitFor({timeout:60000});
    if(route.startsWith('atlas')) {
     await page.locator('canvas').first().waitFor({timeout:60000});
     await page.getByText(/TEST CODE repd-2484 \| ENGINE COMPLETED/).waitFor({timeout:60000});
    }
    await page.getByRole('button',{name:'Teleprinter',exact:true}).click();
    const downloaded=await clickAndReadDownload(page,page.getByRole('button',{name:'Print source code',exact:true}),{timeout:60000});
    assert.ok(downloaded.ok,downloaded.error);
    const source=downloaded.bytes.toString('utf8');
    assert.match(source,/PRINT SOURCE CODE/);
    assert.match(source,/https:\/\/github.com\/Ventusltd\/testcode/);
    assert.match(source,/drivers|teleprinter/);
    assert.ok(source.length>10000,'source coverage unexpectedly small');
    await page.getByRole('button',{name:'Copy source code',exact:true}).click();
    const pdf=await clickAndReadDownload(page,page.getByRole('button',{name:'Print',exact:true}),{timeout:60000});
    assert.ok(pdf.ok,pdf.error);
    assert.ok(captured);
    const inspected=spawnSync('python',[path.join(here,'inspect-pdf.py')],{input:JSON.stringify({pdf:pdf.bytes.toString('base64'),png:captured.toString('base64')}),encoding:'utf8',maxBuffer:1000000});
    assert.equal(inspected.status,0,inspected.stderr);
    results.push({browser:name,route,ok:true,...(route.startsWith('atlas')?{gridEngineCompleted:true}:{}),sourceBytes:downloaded.bytes.length,pdf:JSON.parse(inspected.stdout)});
    console.log(`PASS ${name} ${route||'landing'}: ${downloaded.bytes.length} source bytes, screen pixels preserved`);
   } catch(error) {results.push({browser:name,route,ok:false,error:String(error)}); console.log(`FAIL ${name} ${route}: ${error.message}`);}
   finally {captured=undefined;await context.close().catch(()=>{});}
  }
 } finally {await browser.close();}
}
await fs.writeFile(path.join(here,'app-outcomes.json'),JSON.stringify({createdAt:new Date().toISOString(),base,physicalDevices:false,results},null,2)+'\n');
if(results.some(result=>!result.ok))process.exitCode=1;
