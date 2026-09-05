/** Actual controls, download bytes and rendered pixel comparison. No retained screenshots/PDFs. */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createSourceCodeBundle } from './source-code.mjs';
import { attachScreenCapture, clickAndReadDownload } from './driver.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(root,'../..');
const modulePath = process.env.PLAYWRIGHT_MODULE;
const { chromium, firefox, webkit } = modulePath ? await import(pathToFileURL(modulePath).href) : await import('playwright');
const bundle = await createSourceCodeBundle({ repoDir: repo, revision: 'HEAD', paths: ['README.md','pdf.js'] });
const sourceBytes = Buffer.from(bundle.text);
const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url,'http://localhost');
    if (url.pathname.endsWith('/source-code.txt')) { res.setHeader('Content-Type','text/plain;charset=utf-8'); res.end(sourceBytes); return; }
    if (url.pathname.endsWith('/source-code.manifest.json')) { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(bundle.manifest)); return; }
    const filename = path.resolve(root, '.'+decodeURIComponent(url.pathname));
    if (!filename.startsWith(root+path.sep)) throw new Error('outside root');
    res.setHeader('Content-Type', filename.endsWith('.html') ? 'text/html;charset=utf-8' : 'text/javascript');
    res.end(await fs.readFile(filename));
  } catch { res.writeHead(404); res.end('Not found'); }
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base = `http://127.0.0.1:${server.address().port}/demo.html`;
const reports = [];
const engines = [['Chrome',chromium,{channel:'chrome'}],['Edge',chromium,{channel:'msedge'}],['Firefox',firefox,{}],['WebKit',webkit,{}]];
const viewports = [
  {name:'desktop landscape',width:1200,height:800,dpr:1},
  {name:'desktop portrait',width:800,height:1100,dpr:1},
  {name:'mobile portrait emulation',width:393,height:852,dpr:2},
  {name:'mobile landscape emulation',width:852,height:393,dpr:2}
];
try {
  for (const [name, engine, options] of engines) {
    let browser;
    try { browser = await engine.launch({headless:true,...options}); }
    catch(error) { reports.push({browser:name,ok:false,error:String(error)}); console.log(`FAIL ${name}: ${error.message}`); continue; }
    try {
      for (const viewport of viewports) {
        const context = await browser.newContext({viewport:{width:viewport.width,height:viewport.height},deviceScaleFactor:viewport.dpr,acceptDownloads:true});
        const page = await context.newPage();
        let captured;
        try {
          await attachScreenCapture(page,{onCapture:png=>{captured=png;}});
          await page.goto(base);
          await page.getByLabel('Show grid layer').check();
          assert.equal(await page.locator('#layer-state').textContent(),'Grid layer visible');
          const pdf = await clickAndReadDownload(page,page.getByRole('button',{name:'Print',exact:true}));
          assert.ok(pdf.ok,pdf.error);
          assert.ok(captured,'no browser capture');
          const inspected = spawnSync('python',[path.join(root,'inspect-pdf.py')],{input:JSON.stringify({pdf:pdf.bytes.toString('base64'),png:captured.toString('base64')}),encoding:'utf8',maxBuffer:4000000});
          assert.equal(inspected.status,0,inspected.stderr);
          const pixels = JSON.parse(inspected.stdout);
          assert.equal(pixels.width,viewport.width*viewport.dpr);
          assert.equal(pixels.height,viewport.height*viewport.dpr);
          await page.locator('details').evaluate(node=>{node.open=true;});
          await page.locator('#screenshot').setInputFiles({name:'device-screenshot.png',mimeType:'image/png',buffer:captured});
          const uploaded = await clickAndReadDownload(page,page.getByRole('button',{name:'Print selected screenshot',exact:true}));
          assert.ok(uploaded.ok,uploaded.error);
          const uploadedCheck = spawnSync('python',[path.join(root,'inspect-pdf.py')],{input:JSON.stringify({pdf:uploaded.bytes.toString('base64'),png:captured.toString('base64')}),encoding:'utf8',maxBuffer:4000000});
          assert.equal(uploadedCheck.status,0,uploadedCheck.stderr);
          const text = await clickAndReadDownload(page,page.getByRole('button',{name:'Print source code',exact:true}));
          assert.ok(text.ok,text.error);
          assert.deepEqual(text.bytes,sourceBytes,'downloaded source differs from committed bundle');
          assert.match(text.filename,/\.txt$/);
          // Force the real manual fallback rather than letting clipboard privileges mask it.
          await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new DOMException('Denied','NotAllowedError');}},configurable:true});});
          await page.getByRole('button',{name:'Copy source code',exact:true}).click();
          await page.waitForFunction(()=>document.querySelector('textarea')?.value.length>0);
          assert.equal(await page.locator('textarea').inputValue(),sourceBytes.toString('utf8'));
          reports.push({browser:name,version:browser.version(),viewport:viewport.name,ok:true,...pixels,uploadedScreenshotPixelsIdentical:true,sourceBytes:text.bytes.length,sourceDownloadIdentical:true,copyFallbackComplete:true});
          console.log(`PASS ${name} ${viewport.name}: PDF ${pixels.width}x${pixels.height}, source ${text.bytes.length} bytes, complete copy fallback`);
        } catch(error) { reports.push({browser:name,viewport:viewport.name,ok:false,error:String(error)}); console.log(`FAIL ${name} ${viewport.name}: ${error.message}`); }
        finally { captured=undefined; await context.close().catch(error=>{reports.push({browser:name,case:'context cleanup',ok:false,error:String(error)});}); }
      }
      const context=await browser.newContext({acceptDownloads:true});
      try {
        const page=await context.newPage(); await page.goto(base);
        if (name === 'Chrome') {
          const timeoutCleanup = await page.evaluate(async()=>{
            const {printScreen}=await import('./print-screen.js');
            let stopped=0;
            Object.defineProperty(navigator.mediaDevices,'getDisplayMedia',{configurable:true,value:async()=>({getTracks:()=>[{stop(){stopped++;}}]})});
            const original=document.createElement.bind(document);
            document.createElement=(tag,...args)=>tag==='video'?{play:()=>new Promise(()=>{}),pause(){}}:original(tag,...args);
            try { await printScreen(); return {stopped,error:null}; }
            catch(error) { return {stopped,error:error.message}; }
            finally { document.createElement=original; }
          });
          assert.equal(timeoutCleanup.stopped,1,'stalled playback must stop capture');
          assert.match(timeoutCleanup.error,/No screen frame/);
          reports.push({browser:name,case:'stalled display playback stops capture',ok:true});
        }
        const absent=await clickAndReadDownload(page,page.locator('#nonexistent'),{timeout:500});
        assert.equal(absent.ok,false,'missing control must fail');
        await page.route('**/source-code.txt',route=>route.fulfill({body:'corrupt source',contentType:'text/plain'}));
        await page.reload();
        const corrupt=await clickAndReadDownload(page,page.getByRole('button',{name:'Print source code',exact:true}),{timeout:1500});
        assert.equal(corrupt.ok,false,'corrupt source must never download');
        reports.push({browser:name,case:'missing-control and corrupt-source fail without crashing',ok:true});
        console.log(`PASS ${name}: missing control and corrupt source rejected`);
      } catch(error) { reports.push({browser:name,case:'negative controls',ok:false,error:String(error)}); }
      finally { await context.close().catch(error=>{reports.push({browser:name,case:'context cleanup',ok:false,error:String(error)});}); }
    } finally { await browser.close().catch(error=>{reports.push({browser:name,case:'browser cleanup',ok:false,error:String(error)});}); }
  }
} finally { await new Promise(resolve=>server.close(resolve)); }
await fs.writeFile(path.join(root,'outcome-results.json'),JSON.stringify({createdAt:new Date().toISOString(),capture:'Playwright browser compositor screenshot; pixels in memory only',physicalDeviceTests:false,reports},null,2)+'\n');
if (reports.some(r=>!r.ok)) process.exitCode=1;
