/** Fail-closed, offline design freeze gate. No publishing or Git mutation. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
export const OFFLINE_ROOT = 'C:/Users/vikra/OneDrive/Desktop/offline-screenshots';
export const digest = data => createHash('sha256').update(data).digest('hex');
const stable = value => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a],[b]) => a.localeCompare(b))) : v);
const identityKeys = ['url','generation','sourceCommit','engineCommit','buildSha256'];
const same = (a,b) => stable(a) === stable(b);
const inside = (file, root) => { const relative = path.relative(path.resolve(root), path.resolve(file)); return relative && !relative.startsWith('..') && !path.isAbsolute(relative); };
export function evaluateFreeze({ report, pins, files = {}, inspections = {}, currentHeads = {}, reachableCommits = {}, buildPaths = [], checkedPaths = {}, offlineRoot = OFFLINE_ROOT }) {
  const errors = [], evidence = [];
  const check = (condition, message) => { if (!condition) errors.push(message); return condition; };
  const candidate = pins?.candidate;
  if (!check(candidate && report, 'Missing report or pinned candidate')) return { status: 'REJECTED', errors };
  for (const key of identityKeys) check(typeof candidate[key] === 'string' && candidate[key].length > 0, `Missing candidate ${key}`);
  check(/^[a-f0-9]{40,64}$/.test(candidate.sourceCommit || ''), 'Source commit must be full SHA');
  check(/^[a-f0-9]{40,64}$/.test(candidate.engineCommit || ''), 'Engine commit must be full SHA');
  check(/^[a-f0-9]{64}$/.test(candidate.buildSha256 || ''), 'Missing build digest');
  check(pins.expectedFurniture?.header?.length > 0 && pins.expectedFurniture?.footer?.some(text => text.includes(candidate.generation)), 'Expected footer must identify the candidate generation');
  check(same(report.candidate, candidate), 'Report candidate differs from pinned candidate');
  check(report.finishedAt && report.ok === true, 'Report not completed successfully');
  check(report.browser === 'installed Chrome' && report.actualVisits === 50 && report.savedDownloads === 50 && report.expectedVisits === 50 && report.requestedScenarios === 25, 'Expected exactly fifty installed Chrome visits');
  check(Array.isArray(pins.heads) && pins.heads.length > 0, 'Missing repository HEAD pins');
  for (const commit of [candidate.sourceCommit,candidate.engineCommit]) check(reachableCommits[commit] === true, `Pinned commit absent or not an ancestor of captured HEAD: ${commit}`);
  for (const head of pins.heads || []) check(currentHeads[head.repo] === head.commit, `Stale HEAD: ${head.repo}`);
  check(Array.isArray(pins.inputs) && pins.inputs.length > 0, 'Missing source/build input pins');
  check(pins.inputs?.some(input => input.sha256 === candidate.buildSha256), 'Build digest is not a pinned input');
  for (const input of pins.inputs || []) check(files[input.path] && digest(files[input.path]) === input.sha256, `Changed or missing pinned input: ${input.path}`);
  let buildManifest;
  try { buildManifest = JSON.parse(files[pins.buildManifestPath]?.toString('utf8')); } catch { check(false, 'Missing or invalid build manifest'); }
  check(files[pins.buildManifestPath] && digest(files[pins.buildManifestPath]) === candidate.buildSha256, 'Build manifest hash mismatch');
  check(Array.isArray(buildManifest?.files) && buildManifest.files.length > 0, 'Empty build inventory');
  check(pins.buildRoot && buildPaths.length > 0 && same([...buildPaths].sort(), (buildManifest?.files || []).map(entry => entry.path).sort()), 'Served directory inventory differs from build manifest');
  for (const entry of buildManifest?.files || []) check(inside(entry.path, pins.buildRoot || '.') && files[entry.path] && digest(files[entry.path]) === entry.sha256, `Changed or missing served build file: ${entry.path}`);
  const scenarios = report.scenarios || [];
  check(scenarios.length === 25 && new Set(scenarios.map(s => s.id)).size === 25, 'Expected twenty-five unique scenarios');
  const visits = scenarios.flatMap(s => s.visits || []);
  check(visits.length === 50 && visits.filter(v => v.mode === 'pdf').length === 25 && visits.filter(v => v.mode === 'source').length === 25, 'Expected 25 PDF and 25 source visits');
  const ids = new Set(), paths = new Set();
  function artifact(file, hash, kind) {
    if (!check(typeof file === 'string' && inside(file, offlineRoot) && checkedPaths[file] === true, `${kind} path must resolve under offline root: ${file}`)) return null;
    check(!paths.has(file), `Artifact reused: ${file}`); paths.add(file);
    const bytes = files[file];
    if (!check(bytes && /^[a-f0-9]{64}$/.test(hash || '') && digest(bytes) === hash, `Missing or mutated ${kind}: ${file}`)) return null;
    evidence.push({ path:file, sha256:hash, bytes:bytes.length, kind }); return bytes;
  }
  for (const scenario of scenarios) {
    check(scenario.pairStateMatches === true && scenario.visits?.length === 2, `Incomplete pair ${scenario.id}`);
    const [pdf,source] = scenario.visits || [];
    check(pdf?.mode === 'pdf' && source?.mode === 'source' && pdf?.state?.url === source?.state?.url && same(pdf?.state?.selectedLayerKeys || [], source?.state?.selectedLayerKeys || []) && pdf?.state?.project === source?.state?.project, `State mismatch ${scenario.id}`);
    for (const visit of scenario.visits || []) {
      const label = `${scenario.id}/${visit.mode}`;
      check(visit.ok === true && !visit.error && !!visit.closedAt && visit.browser === 'installed Chrome', `Failed or incomplete Chrome visit ${label}`);
      check(visit.visitId && !ids.has(visit.visitId), `Missing or reused visit ID ${label}`); ids.add(visit.visitId);
      check(same(visit.candidate, candidate), `Candidate mismatch ${label}`);
      try { check(new URL(visit.state?.url).href.startsWith(new URL(candidate.url).href.replace(/\/?$/, '/')), `URL outside candidate ${label}`); } catch { check(false, `Invalid URL ${label}`); }
      const bytes = artifact(visit.path, visit.sha256, visit.mode);
      check(bytes?.length === visit.bytes, `Byte count mismatch ${label}`);
      if (visit.mode === 'pdf') {
        artifact(visit.pngPath, visit.pngSha256, 'png');
        const proof = inspections[visit.path];
        check(proof?.sha256 === visit.sha256 && proof?.embeddedPixelsIdentical === true && proof?.renderedPixelsIdentical === true, `Pixel proof missing or failed ${label}`);
        check(proof?.headersFootersPresent === true && proof?.imageRect?.[1] > 0 && proof?.imageRect?.[3] < proof?.pageHeight, `Header/footer must be outside image ${label}`);
        check(proof?.expectedFurnitureMatched === true, `Expected header/footer text mismatch ${label}`);
      } else if (visit.mode === 'source' && bytes) {
        const text = bytes.toString('utf8');
        const match = text.match(/===== BEGIN DIAGNOSTIC MANIFEST =====\n([\s\S]*?)\n===== END DIAGNOSTIC MANIFEST =====/);
        let diagnostic; try { diagnostic = JSON.parse(match?.[1]); } catch { check(false, `Missing source diagnostic ${label}`); }
        if (diagnostic) {
          check(diagnostic.format === 'codex-runtime-source-v1' && diagnostic.baseManifest?.commit === candidate.sourceCommit && diagnostic.state?.url === visit.state?.url, `Source identity mismatch ${label}`);
          check(typeof diagnostic.state?.visibleText === 'string' && diagnostic.state.visibleText.length > 0 && Array.isArray(diagnostic.state.forms) && diagnostic.state.viewport, `Missing current runtime state ${label}`);
          check(Array.isArray(diagnostic.failures) && diagnostic.failures.length === 0, `Unavailable runtime source dependencies ${label}`);
          check(Array.isArray(diagnostic.limitations) && diagnostic.limitations.length > 0 && Array.isArray(diagnostic.discoveryWarnings), `Source limitations not stated ${label}`);
          check(Array.isArray(diagnostic.resources) && diagnostic.resources.length > 0, `Missing runtime dependency inventory ${label}`);
          function framed(prefix, suffix, expectedBytes, expectedHash, encoding = 'utf-8') {
            const start = bytes.indexOf(Buffer.from(prefix));
            if (!check(start >= 0, `Missing source frame ${label}: ${prefix.slice(0,80)}`)) return;
            const bodyStart = start + Buffer.byteLength(prefix);
            const size = encoding === 'base64' ? 4 * Math.ceil(expectedBytes / 3) : expectedBytes;
            const body = bytes.subarray(bodyStart, bodyStart + size);
            const decoded = encoding === 'base64' ? Buffer.from(body.toString('ascii'),'base64') : body;
            check(Number.isSafeInteger(expectedBytes) && expectedBytes >= 0 && decoded.length === expectedBytes && digest(decoded) === expectedHash && bytes.subarray(bodyStart+size,bodyStart+size+Buffer.byteLength(suffix)).equals(Buffer.from(suffix)), `Corrupt source frame ${label}`);
          }
          const base = diagnostic.baseManifest || {};
          framed(`===== BEGIN PINNED SOURCE | bytes=${base.byteCount} | sha256=${base.sha256} =====\n`, '\n===== END PINNED SOURCE =====', base.byteCount, base.sha256);
          const document = text.match(/===== BEGIN CURRENT DOCUMENT \| bytes=(\d+) \| sha256=([a-f0-9]{64}) =====\n/);
          check(!!document, `Current document missing ${label}`);
          if (document) framed(document[0], '\n===== END CURRENT DOCUMENT =====', Number(document[1]), document[2]);
          for (const resource of diagnostic.resources || []) {
            check(resource.status === 'included' && ['utf-8','base64'].includes(resource.encoding), `Unavailable runtime dependency ${label}: ${resource.url}`);
            framed(`===== BEGIN RESOURCE ${JSON.stringify(resource.url)} | originalBytes=${resource.byteCount} | encoding=${resource.encoding} | sha256=${resource.sha256} =====\n`, `\n===== END RESOURCE ${JSON.stringify(resource.url)} =====`, resource.byteCount, resource.sha256, resource.encoding);
          }
        }
      }
    }
  }
  const proofSha256 = digest(stable({ report, evidence, inputs:pins.inputs, heads:pins.heads }));
  return { status:errors.length ? 'REJECTED' : 'DESIGN FREEZE', candidate, proofSha256, counts:{visits:visits.length,pdf:visits.filter(v=>v.mode==='pdf').length,source:visits.filter(v=>v.mode==='source').length,png:evidence.filter(v=>v.kind==='png').length}, evidence, errors, scope:'Installed Chrome emulation; selected runtime dependencies and current state. Known unloaded/computed references are explicit limitations; no universal dependency completeness claim.' };
}
const here = path.dirname(fileURLToPath(import.meta.url));
async function inventory(directory) {
  const output = [];
  for (const entry of await fs.readdir(directory, {withFileTypes:true})) {
    if (entry.name === '.git') continue;
    const filename = path.resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Build symlink is not accepted: ${filename}`);
    if (entry.isDirectory()) output.push(...await inventory(filename));
    else if (entry.isFile()) output.push(filename);
  }
  return output.sort();
}
async function run(reportPath, pinsPath) {
  const [report,pins] = await Promise.all([fs.readFile(reportPath,'utf8').then(JSON.parse),fs.readFile(pinsPath,'utf8').then(JSON.parse)]);
  const files = {}, checkedPaths = {}, currentHeads = {}, reachableCommits = {}, inspections = {};
  let buildPaths = [];
  try { buildPaths = await inventory(pins.buildRoot); } catch {}
  const visits = (report.scenarios || []).flatMap(s => s.visits || []);
  for (const filename of [...(pins.inputs || []).map(v=>v.path), ...visits.flatMap(v=>[v.path,v.pngPath]).filter(Boolean)]) {
    try { const real = await fs.realpath(filename); checkedPaths[filename] = !!inside(real, await fs.realpath(OFFLINE_ROOT)); files[filename] = await fs.readFile(filename); } catch { /* Missing evidence is rejected below. */ }
  }
  let buildManifest;
  try { files[pins.buildManifestPath] = await fs.readFile(pins.buildManifestPath); buildManifest = JSON.parse(files[pins.buildManifestPath]);
    for (const entry of buildManifest.files || []) { try { files[entry.path] = await fs.readFile(entry.path); } catch {} }
  } catch {}
  for (const head of pins.heads || []) {
    const result = spawnSync('git',['-C',head.repo,'rev-parse','HEAD'],{encoding:'utf8'});
    if (result.status === 0) currentHeads[head.repo] = result.stdout.trim();
    for (const commit of [pins.candidate.sourceCommit,pins.candidate.engineCommit]) {
      const ancestor = spawnSync('git',['-C',head.repo,'merge-base','--is-ancestor',commit,head.commit],{encoding:'utf8'});
      if (ancestor.status === 0) reachableCommits[commit] = true;
    }
  }
  for (const visit of visits.filter(v => v.mode === 'pdf')) {
    if (!files[visit.path] || !files[visit.pngPath] || !checkedPaths[visit.path] || !checkedPaths[visit.pngPath]) continue;
    const result = spawnSync('python',[path.join(here,'inspect-pdf.py')],{input:JSON.stringify({pdf:files[visit.path].toString('base64'),png:files[visit.pngPath].toString('base64')}),encoding:'utf8',maxBuffer:2000000,timeout:60000});
    if (result.status !== 0) continue;
    try {
      const proof = JSON.parse(result.stdout);
      const expected = pins.expectedFurniture;
      if (Array.isArray(expected?.header) && expected.header.length && Array.isArray(expected?.footer) && expected.footer.length) {
        const script = 'import sys,json,base64,pymupdf\np=json.load(sys.stdin); d=pymupdf.open(stream=base64.b64decode(p["pdf"]),filetype="pdf"); r=p["rect"]; page=d[0]; h=page.get_text(clip=pymupdf.Rect(0,0,page.rect.width,r[1])); f=page.get_text(clip=pymupdf.Rect(0,r[3],page.rect.width,page.rect.height)); print(json.dumps(all(s in h for s in p["header"]) and all(s in f for s in p["footer"])))';
        const textProof = spawnSync('python',['-c',script],{input:JSON.stringify({pdf:files[visit.path].toString('base64'),rect:proof.imageRect,...expected}),encoding:'utf8',timeout:60000});
        proof.expectedFurnitureMatched = textProof.status === 0 && textProof.stdout.trim() === 'true';
      }
      inspections[visit.path] = proof;
    } catch { /* Invalid inspection cannot qualify. */ }
  }
  // Re-read all inputs and HEADs after expensive PDF inspection to catch changes during verification.
  for (const input of [...(pins.inputs || []), ...(buildManifest?.files || []), ...visits.flatMap(visit => [visit.path,visit.pngPath].filter(Boolean).map(path => ({path}))), {path:pins.buildManifestPath}]) { try { files[input.path] = await fs.readFile(input.path); } catch { delete files[input.path]; } }
  for (const head of pins.heads || []) {
    const result = spawnSync('git',['-C',head.repo,'rev-parse','HEAD'],{encoding:'utf8'});
    if (result.status !== 0 || result.stdout.trim() !== currentHeads[head.repo]) currentHeads[head.repo] = 'CHANGED';
  }
  try { if (!same(buildPaths, await inventory(pins.buildRoot))) buildPaths = []; } catch { buildPaths = []; }
  const freeze = evaluateFreeze({report,pins,files,inspections,currentHeads,reachableCommits,buildPaths,checkedPaths});
  if (freeze.status !== 'DESIGN FREEZE') { console.error(JSON.stringify(freeze)); return false; }
  const directory = path.join(OFFLINE_ROOT,'design-freeze'); await fs.mkdir(directory,{recursive:true});
  const stem = path.join(directory,freeze.proofSha256);
  try { await fs.writeFile(stem+'.json',JSON.stringify(freeze,null,2)+'\n',{flag:'wx'}); }
  catch (error) { if (error.code === 'EEXIST') return true; throw error; }
  await fs.writeFile(stem+'.md',`# DESIGN FREEZE\n\nCandidate: ${freeze.candidate.url}\n\nGeneration: ${freeze.candidate.generation}\n\nSource commit: ${freeze.candidate.sourceCommit}\n\nEngine commit: ${freeze.candidate.engineCommit}\n\nBuild SHA-256: ${freeze.candidate.buildSha256}\n\nProof SHA-256: ${freeze.proofSha256}\n\n50 Chrome visits; 25 PDF + 25 source + 25 PNG.\n\n${freeze.scope}\n\nEvidence digests: see adjacent JSON.\n`,{flag:'wx'});
  console.log(JSON.stringify({status:'READY',record:stem+'.json',candidate:freeze.candidate,proofSha256:freeze.proofSha256})); return true;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [report,pins,...options] = process.argv.slice(2);
  if (!report || !pins) { console.error('Usage: node design-freeze.mjs REPORT.json PINS.json [--watch=SECONDS]'); process.exitCode = 2; }
  else {
    const option = options.find(v=>v.startsWith('--watch=')); const interval = option ? Number(option.split('=')[1]) : 0;
    if (option && (!Number.isFinite(interval) || interval < 5)) throw new Error('Watch interval must be at least 5 seconds');
    let previous;
    do {
      try {
        const signature = digest(await fs.readFile(report)) + digest(await fs.readFile(pins));
        if (signature !== previous) { const ok = await run(report,pins); previous = signature; if (!interval && !ok) process.exitCode = 1; }
      } catch (error) { console.error(JSON.stringify({status:'REJECTED',error:String(error)})); if (!interval) process.exitCode = 1; }
      if (interval) await new Promise(resolve=>setTimeout(resolve,interval*1000));
    } while (interval);
  }
}
