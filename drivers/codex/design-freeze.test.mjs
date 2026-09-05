import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFreeze, digest, OFFLINE_ROOT } from './design-freeze.mjs';
function fixture() {
 const candidate={url:'https://example.org/20260905/',generation:'20260905',sourceCommit:'a'.repeat(40),engineCommit:'b'.repeat(40),buildSha256:digest(JSON.stringify({files:[{path:'served/code.js',sha256:digest('code')}]}))};
 const pins={candidate,expectedFurniture:{header:['GLOBALGRID2050'],footer:[candidate.generation]},buildManifestPath:'build',buildRoot:'served',heads:[{repo:'source',commit:candidate.sourceCommit},{repo:'engine',commit:candidate.engineCommit}],inputs:[{path:'build',sha256:candidate.buildSha256}]};
 const report={candidate,browser:'installed Chrome',finishedAt:'2026-09-05',ok:true,actualVisits:50,savedDownloads:50,expectedVisits:50,requestedScenarios:25,scenarios:[]};
 const input={pins,report,files:{build:Buffer.from(JSON.stringify({files:[{path:'served/code.js',sha256:digest('code')}]})), 'served/code.js':Buffer.from('code')},buildPaths:['served/code.js'],reachableCommits:{[candidate.sourceCommit]:true,[candidate.engineCommit]:true},checkedPaths:{},inspections:{},currentHeads:{source:candidate.sourceCommit,engine:candidate.engineCommit}};
 for(let i=0;i<25;i++) {
  const state={url:candidate.url+'atlas/',project:'1',selectedLayerKeys:['400']};
  const base=Buffer.from('PRINT SOURCE CODE\n'), doc=Buffer.from('<html>Current state</html>'), body=Buffer.from('export const current = true;');
  const resource={url:candidate.url+'code.js',status:'included',byteCount:body.length,sha256:digest(body),encoding:'utf-8'};
  const manifest={format:'codex-runtime-source-v1',baseManifest:{commit:candidate.sourceCommit,byteCount:base.length,sha256:digest(base)},state:{url:state.url,visibleText:'Current state',forms:[],viewport:{width:100,height:100}},failures:[],limitations:['Computed unloaded references cannot be proven complete.'],discoveryWarnings:[],resources:[resource]};
  const source=Buffer.from('PRINT SOURCE CODE\n===== BEGIN DIAGNOSTIC MANIFEST =====\n'+JSON.stringify(manifest)+'\n===== END DIAGNOSTIC MANIFEST =====\n'+`===== BEGIN PINNED SOURCE | bytes=${base.length} | sha256=${digest(base)} =====\n`+base+'\n===== END PINNED SOURCE =====\n'+`===== BEGIN CURRENT DOCUMENT | bytes=${doc.length} | sha256=${digest(doc)} =====\n`+doc+'\n===== END CURRENT DOCUMENT =====\n'+`===== BEGIN RESOURCE ${JSON.stringify(resource.url)} | originalBytes=${body.length} | encoding=utf-8 | sha256=${digest(body)} =====\n`+body+`\n===== END RESOURCE ${JSON.stringify(resource.url)} =====`);
  const visits=['pdf','source'].map(mode=>{const bytes=mode==='source'?source:Buffer.from('PDF fixture '+i);const file=OFFLINE_ROOT+`/case-${i}.${mode}`;input.files[file]=bytes;input.checkedPaths[file]=true;return {mode,state,candidate,visitId:`${i}-${mode}`,browser:'installed Chrome',ok:true,closedAt:'done',path:file,sha256:digest(bytes),bytes:bytes.length};});
  const pdf=visits[0];pdf.pngPath=OFFLINE_ROOT+`/case-${i}.png`;input.files[pdf.pngPath]=Buffer.from('PNG fixture '+i);input.checkedPaths[pdf.pngPath]=true;pdf.pngSha256=digest(input.files[pdf.pngPath]);
  input.inspections[pdf.path]={sha256:pdf.sha256,embeddedPixelsIdentical:true,renderedPixelsIdentical:true,headersFootersPresent:true,imageRect:[0,10,100,110],pageHeight:120,expectedFurnitureMatched:true};
  report.scenarios.push({id:String(i),pairStateMatches:true,visits});
 }
 return input;
}
test('complete, matching offline evidence qualifies with explicit limited scope',()=>{const result=evaluateFreeze(fixture());assert.equal(result.status,'DESIGN FREEZE',result.errors.join('\n'));assert.deepEqual(result.counts,{visits:50,pdf:25,source:25,png:25});});
for(const [name,mutate] of Object.entries({
 'one missing visit':x=>x.report.scenarios[0].visits.pop(),
 'mutated PDF':x=>x.files[x.report.scenarios[0].visits[0].path]=Buffer.from('changed'),
 'bad PNG hash':x=>x.report.scenarios[0].visits[0].pngSha256='0'.repeat(64),
 'missing PNG':x=>delete x.files[x.report.scenarios[0].visits[0].pngPath],
 'stale HEAD':x=>x.currentHeads.source='c'.repeat(40),
 'changed served file with unchanged manifest':x=>x.files['served/code.js']=Buffer.from('mutated'),
 'unlisted served file':x=>x.buildPaths.push('served/unlisted.js'),
 'unreachable source commit':x=>delete x.reachableCommits[x.pins.candidate.sourceCommit],
 'changed build':x=>x.files.build=Buffer.from('changed'),
 'failed visit':x=>x.report.scenarios[0].visits[0].ok=false,
 'missing completion':x=>delete x.report.finishedAt,
 'wrong candidate':x=>x.report.scenarios[0].visits[0].candidate={...x.pins.candidate,generation:'other'},
 'reused visit':x=>x.report.scenarios[0].visits[0].visitId='1-pdf',
 'PNG link outside root':x=>x.checkedPaths[x.report.scenarios[0].visits[0].pngPath]=false,
 'pixel difference':x=>x.inspections[x.report.scenarios[0].visits[0].path].renderedPixelsIdentical=false,
 'header covers image':x=>x.inspections[x.report.scenarios[0].visits[0].path].imageRect[1]=0,
 'wrong header text':x=>x.inspections[x.report.scenarios[0].visits[0].path].expectedFurnitureMatched=false,
 'source frame altered but outer hash updated':x=>{const v=x.report.scenarios[0].visits[1];x.files[v.path]=Buffer.from(x.files[v.path].toString().replace('export const current = true;','export const current = fake;'));v.sha256=digest(x.files[v.path]);v.bytes=x.files[v.path].length;},
 'source dependency unavailable':x=>{const v=x.report.scenarios[0].visits[1];x.files[v.path]=Buffer.from(x.files[v.path].toString().replace('"status":"included"','"status":"unavailable"'));v.sha256=digest(x.files[v.path]);v.bytes=x.files[v.path].length;}
})) test(name+' rejects',()=>{const input=fixture();mutate(input);assert.equal(evaluateFreeze(input).status,'REJECTED');});
