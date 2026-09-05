import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {clickAndReadDownload} from './driver.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const {chromium,firefox,webkit}=await import(pathToFileURL('C:/Users/vikra/OneDrive/Documents/GitHub/gridatlas-main-202609050200/node_modules/playwright/index.mjs'));
const base=process.argv[2] || 'https://globalgrid2050.com/testcode/202609051623/';
const output=path.join('C:/Users/vikra/OneDrive/Desktop/offline-screenshots','app-print-'+new Date().toISOString().replace(/[:.]/g,'-'));
await fs.mkdir(output,{recursive:true});
const count=Number(process.env.PRINT_CASES||6), records=[];
for(let i=0;i<count;i++){
 const engine=[chromium,firefox,webkit][Math.floor(i/2)%3], name=['chrome','firefox','webkit'][Math.floor(i/2)%3];
 const viewport=i%2?{width:393,height:852}:{width:1365,height:900};
 const record={name,viewport};let browser;
 try{
  browser=await engine.launch({headless:true,...(name==='chrome'?{channel:'chrome'}:{})});
  const context=await browser.newContext({viewport,deviceScaleFactor:i%2?2:1,acceptDownloads:true});
  await context.addInitScript(()=>{window.__forbiddenPrintCalls=0;window.print=()=>{window.__forbiddenPrintCalls++;throw Error('Browser print forbidden');};if(navigator.mediaDevices)navigator.mediaDevices.getDisplayMedia=()=>{window.__forbiddenPrintCalls++;throw Error('Screen sharing forbidden');};window.__codexTeleprinterCapture=()=>{window.__forbiddenPrintCalls++;throw Error('Host screenshot injection forbidden');};});
  if(process.env.LOCAL_DRIVERS==='1')await context.route('**/teleprinter/**',async route=>{
    const rel=new URL(route.request().url()).pathname.split('/teleprinter/')[1];
    if(['controls.js','print-screen.js','app-frame.js','vendor/html2canvas-1.4.1.mjs'].includes(rel))return route.fulfill({body:await fs.readFile(path.join(here,rel)),contentType:'text/javascript'});
    return route.continue();
  });
  const page=await context.newPage();record.errors=[];page.on('pageerror',e=>record.errors.push(String(e)));
  await page.goto(new URL('atlas/?repd_ref=2470&technology=wind_offshore&latitude=52.1374391&longitude=2.1708996&zoom=12&project=East+Anglia+3+(EA+3)&capacity_mw=1400',base).href,{waitUntil:'domcontentloaded'});
  await page.getByText(/TEST CODE repd-2470 \| ENGINE COMPLETED/).first().waitFor({timeout:90000});
  const toggle=page.locator('#gridatlas-dash-toggle');if(!/HIDE LAYERS/.test(await toggle.innerText()))await toggle.click();
  await page.locator('.gm-title').filter({hasText:/^File$/i}).click();
  await page.evaluate(()=>document.querySelector('#codex-teleprinter').addEventListener('teleprint',e=>window.__printReceipt=e.detail));
  await page.screenshot({path:path.join(output,`${i}-${name}-reference.png`),scale:'device'});
  const downloaded=await clickAndReadDownload(page,page.locator('button[data-gm-export]').filter({hasText:/Print/i}).first(),{timeout:60000});
  assert.ok(downloaded.ok,downloaded.error);
  await fs.writeFile(path.join(output,`${i}-${name}.pdf`),downloaded.bytes);
  record.top=await page.evaluate(()=>document.elementsFromPoint(650,20).map(e=>({tag:e.tagName,id:e.id,shadow:!!e.shadowRoot,html:e.outerHTML.slice(0,200)})));record.receipt=await page.evaluate(()=>window.__printReceipt);record.forbiddenCalls=await page.evaluate(()=>window.__forbiddenPrintCalls);
  assert.equal(record.forbiddenCalls,0);assert.equal(record.receipt.method,'app-render');assert.equal(record.receipt.width,viewport.width*(i%2?2:1));assert.equal(record.receipt.height,viewport.height*(i%2?2:1));
  record.ok=true;
 }catch(error){record.ok=false;record.error=String(error);}finally{await browser?.close();records.push(record);await fs.writeFile(path.join(output,'results.json'),JSON.stringify(records,null,2));console.log(JSON.stringify(record));}
}
console.log(output);if(records.some(r=>!r.ok))process.exitCode=1;
