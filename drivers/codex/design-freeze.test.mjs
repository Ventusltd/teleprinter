import test from 'node:test';
import path from 'node:path';
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

// Shape copied from the real 2026-09-05T14-52-04-724Z-7712 runtime diagnostic:
// resources retain discoveredBy/status; exclusions add the explicit recursion reason.
function withRepresentedTransport() {
 const input=fixture(), visit=input.report.scenarios[0].visits[1];
 const source=input.files[visit.path].toString('utf8');
 const marker=/===== BEGIN DIAGNOSTIC MANIFEST =====\n([\s\S]*?)\n===== END DIAGNOSTIC MANIFEST =====/;
 const manifest=JSON.parse(source.match(marker)[1]);
 const reason='Source transport/pin excluded to prevent recursive capture. The selected verified pinned source and its original manifest are included below; sibling app bundles are references only.';
 const records=['source-pin.json','source-code.manifest.json','source-code.txt'].map(suffix=>({url:new URL(`teleprinter/atlas-${suffix}`,input.pins.candidate.url).href,discoveredBy:[{from:'https://ventusltd.github.io/gridatlas/atlas/releases/202608300453-atlas-v9/',reason:'observed resource (fetch)'}],status:'already-represented'}));
 manifest.resources.push(...records);manifest.exclusions=records.map(resource=>({...resource,reason}));
 const pin={generation:input.pins.candidate.generation,app:'atlas',commit:input.pins.candidate.sourceCommit,sha256:manifest.baseManifest.sha256,byteCount:manifest.baseManifest.byteCount};
 const transport=[JSON.stringify(pin),JSON.stringify(manifest.baseManifest),'PRINT SOURCE CODE\n'];
 const build=JSON.parse(input.files.build.toString('utf8'));
 records.forEach((record,index)=>{const filename=path.resolve(input.pins.buildRoot,'teleprinter',new URL(record.url).pathname.split('/').at(-1));input.files[filename]=Buffer.from(transport[index]);input.buildPaths.push(filename);build.files.push({path:filename,sha256:digest(input.files[filename])});});
 input.files.build=Buffer.from(JSON.stringify(build));input.pins.candidate.buildSha256=digest(input.files.build);input.pins.inputs[0].sha256=input.pins.candidate.buildSha256;
 function saveManifest() {input.files[visit.path]=Buffer.from(source.replace(marker,`===== BEGIN DIAGNOSTIC MANIFEST =====\n${JSON.stringify(manifest)}\n===== END DIAGNOSTIC MANIFEST =====`));visit.sha256=digest(input.files[visit.path]);visit.bytes=input.files[visit.path].length;}
 saveManifest();return {input,manifest,saveManifest};
}
test('selected app transports represented by matching pinned source are accepted',()=>{const {input}=withRepresentedTransport();const result=evaluateFreeze(input);assert.equal(result.status,'DESIGN FREEZE',result.errors.join('\n'));});
test('arbitrary already-represented source file is rejected',()=>{const {input,manifest,saveManifest}=withRepresentedTransport();manifest.resources.at(-1).url=input.pins.candidate.url+'secret-source-code.txt';manifest.exclusions.at(-1).url=manifest.resources.at(-1).url;saveManifest();assert.equal(evaluateFreeze(input).status,'REJECTED');});
test('sibling app transport does not represent selected app',()=>{const {input,manifest,saveManifest}=withRepresentedTransport();manifest.resources.at(-1).url=manifest.resources.at(-1).url.replace('atlas-source','pipeline-source');manifest.exclusions.at(-1).url=manifest.resources.at(-1).url;saveManifest();assert.equal(evaluateFreeze(input).status,'REJECTED');});
test('missing recursion reason rejects represented transport',()=>{const {input,manifest,saveManifest}=withRepresentedTransport();manifest.exclusions[0].reason='Ignore this resource';saveManifest();assert.equal(evaluateFreeze(input).status,'REJECTED');});
test('transport exception never accepts actual unavailable dependency',()=>{const {input,manifest,saveManifest}=withRepresentedTransport();manifest.resources[0].status='unavailable';manifest.failures=[{url:manifest.resources[0].url,reason:'CORS unavailable'}];saveManifest();assert.equal(evaluateFreeze(input).status,'REJECTED');});
test('represented base must match pinned build transport bytes',()=>{const {input}=withRepresentedTransport();const file=input.buildPaths.find(file=>file.endsWith('atlas-source-code.txt'));input.files[file]=Buffer.from('wrong transport');assert.equal(evaluateFreeze(input).status,'REJECTED');});
