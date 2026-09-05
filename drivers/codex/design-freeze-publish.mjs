/** Prepare or explicitly publish one accepted design freeze. No unattended agent loop. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { digest, OFFLINE_ROOT } from './design-freeze.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const stable = value => JSON.stringify(value, (_,v) => v && !Array.isArray(v) && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))) : v);
const requireThat = (value,message) => { if (!value) throw new Error(message); };
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function git(worktree,args) {
 const result = spawnSync('git',['-C',worktree,...args],{encoding:'utf8',maxBuffer:4000000});
 requireThat(result.status === 0, `git ${args[0]} failed: ${result.stderr || result.error || result.stdout}`); return result.stdout.trim();
}
export function prepareHomepage(html, record) {
 requireThat(record.status === 'DESIGN FREEZE' && /^[a-f0-9]{64}$/.test(record.proofSha256 || ''), 'An accepted freeze record is required');
 const c = record.candidate;
 requireThat(/^\d{12,14}$/.test(c?.generation || ''), 'Generation must be an immutable timestamp');
 const url = new URL(c.url); requireThat(url.protocol === 'https:' && url.pathname.endsWith(`/testcode/${c.generation}/`) && !url.search && !url.hash, 'Candidate must have an immutable HTTPS testcode generation URL');
 requireThat(record.counts?.visits === 50 && record.counts?.pdf === 25 && record.counts?.source === 25 && record.counts?.png === 25, 'Freeze counts are incomplete');
 const marker = `<!-- DESIGN FREEZE ${c.generation} ${record.proofSha256} -->`;
 if (html.includes(marker)) return {html,changed:false};
 requireThat(!html.includes(`<!-- DESIGN FREEZE ${c.generation} `), 'This generation already has a different freeze proof');
 const row = `${marker}\n<p><a href="${escape(c.url)}">DESIGN FREEZE — ${escape(c.generation)} UTC</a>: 50 installed Chrome visits; 25 PDF and 25 source downloads. Captured screen pixels match; headers and footers remain outside the image. Browser emulation; source capture limitations are recorded. <a href="./design-freeze/${c.generation}-${record.proofSha256}.json">Proof ${record.proofSha256}</a>.</p>\n`;
 const end = '<!-- DESIGN FREEZE APPEND HERE -->';
 if (html.includes(end)) {
  requireThat(html.indexOf(end) === html.lastIndexOf(end), 'Ambiguous freeze append marker');
  return {html:html.replace(end,row+end),changed:true};
 }
 requireThat((html.match(/<\/body>/g) || []).length === 1, 'Expected exactly one HTML body end');
 const section = `<section id="design-freeze">\n<h2>Design Freeze versions</h2>\n${row}${end}\n</section>\n`;
 return {html:html.replace('</body>',section+'</body>'),changed:true};
}
export function snapshotMetrics(html, names, sourceCommit) {
 const next = 1 + names.reduce((max,name)=>Math.max(max,Number(name.match(/^homepage_v(\d+)\.html$/)?.[1] || 0)),0);
 return {filename:`homepage_v${String(next).padStart(3,'0')}.html`,fileCountBefore:names.length,lineCount:html.split('\n').length-(html.endsWith('\n')?1:0),wordCount:html.trim().split(/\s+/).filter(Boolean).length,characterCount:[...html].length,bytes:Buffer.byteLength(html),sha256:digest(html),sourceCommit,intention:'Append an accepted immutable Design Freeze version while preserving every existing homepage link and version.'};
}
async function inventory(directory) {
 const files=[];
 for(const entry of await fs.readdir(directory,{withFileTypes:true})) {
  if(entry.name === '.git') continue;
  const filename=path.join(directory,entry.name);
  requireThat(!entry.isSymbolicLink(),`Candidate symlink rejected: ${filename}`);
  if(entry.isDirectory()) files.push(...await inventory(filename)); else if(entry.isFile()) files.push(filename);
 }
 return files;
}
export async function verifyCandidateTree(pins, worktree, generation) {
 const directory=path.resolve(worktree,'testcode',generation);
 requireThat(await fs.realpath(directory) === directory, 'Candidate directory may not be a symlink');
 const manifest=JSON.parse(await fs.readFile(pins.buildManifestPath,'utf8'));
 const expected=[];
 for(const entry of manifest.files || []) {
  const relative=path.relative(path.resolve(pins.buildRoot),path.resolve(entry.path));
  requireThat(relative && !relative.startsWith('..') && !path.isAbsolute(relative),'Build entry outside candidate root');
  const filename=path.resolve(directory,relative);
  requireThat(digest(await fs.readFile(filename)) === entry.sha256,`Candidate bytes differ: ${relative}`);
  expected.push(filename);
 }
 requireThat(expected.length && stable(expected.sort()) === stable((await inventory(directory)).sort()),'Candidate tree differs from build inventory');
 return directory;
}
/** Re-read the exact audited registries and original files immediately before staging publication. */
export async function verifyExternalAudit(record, pins) {
 requireThat(Array.isArray(record.externalReviews) && record.externalReviews.length > 0, 'Accepted record has no external review audit');
 for (const audit of record.externalReviews) {
  const pin=pins.inputs?.find(input=>input.path===audit.path);
  const bytes=await fs.readFile(audit.path);
  requireThat(pin && digest(bytes) === pin.sha256 && digest(bytes) === audit.sha256, `External registry changed before publication: ${audit.path}`);
  const review=JSON.parse(bytes);
  const artifacts=(review.runs || []).flatMap(run=>(run.artifacts || []).map(item=>({...item,path:path.resolve(run.directory,item.filename)})));
  for (const resolution of audit.resolutionProofs || []) {
   const proofBytes=await fs.readFile(resolution.path);
   requireThat(digest(proofBytes) === resolution.sha256,'External resolution proof changed before publication');
   artifacts.push(...JSON.parse(proofBytes).evidence);
  }
  const offline=await fs.realpath(OFFLINE_ROOT);
  for (const artifact of artifacts) {
   const real=await fs.realpath(artifact.path), relative=path.relative(offline,real);
   requireThat(relative && !relative.startsWith('..') && !path.isAbsolute(relative),'External artifact escapes offline root');
   const data=await fs.readFile(artifact.path);
   requireThat(data.length === artifact.bytes && digest(data) === artifact.sha256,`External artifact changed before publication: ${artifact.path}`);
  }
 }
}
export async function publishFreeze({recordPath,reportPath,pinsPath,worktree,publish=false}) {
 worktree=await fs.realpath(path.resolve(worktree));
 const record=JSON.parse(await fs.readFile(recordPath,'utf8'));
 const report=JSON.parse(await fs.readFile(reportPath,'utf8'));
 const pins=JSON.parse(await fs.readFile(pinsPath,'utf8'));
 requireThat(stable(record.candidate) === stable(pins.candidate) && stable(report.candidate) === stable(pins.candidate),'Candidate identities differ');
 requireThat(record.proofSha256 === digest(stable({report,evidence:record.evidence,inputs:pins.inputs,heads:pins.heads})),'Freeze report or pinned inputs differ from accepted proof');
 const gate=spawnSync(process.execPath,[path.join(here,'design-freeze.mjs'),path.resolve(reportPath),path.resolve(pinsPath)],{encoding:'utf8',maxBuffer:4000000,timeout:3600000});
 requireThat(gate.status === 0,`Freeze recheck rejected: ${gate.stderr || gate.error || gate.stdout}`);
 const accepted=JSON.parse(await fs.readFile(path.join(OFFLINE_ROOT,'design-freeze',record.proofSha256+'.json'),'utf8'));
 requireThat(stable(record) === stable(accepted),'Supplied record differs from gate-produced record');
 await verifyCandidateTree(pins,worktree,record.candidate.generation);
 const homepage=path.join(worktree,'index.html');
 const original=await fs.readFile(homepage,'utf8');
 const prepared=prepareHomepage(original,record);
 if(!prepared.changed) return {status:'ALREADY PREPARED',generation:record.candidate.generation,proofSha256:record.proofSha256};
 const beforeHead=git(worktree,['rev-parse','HEAD']);
 requireThat(!git(worktree,['diff','--cached','--name-only']),'Unrelated staged changes exist');
 const targeted=['index.html','homepage_versions/README.md'];
 requireThat(!git(worktree,['status','--porcelain','--',...targeted]),'Homepage or snapshot README has uncommitted changes');
 if(publish) {
  requireThat(!git(worktree,['status','--porcelain']),'Publish requires a clean worktree');
  requireThat(git(worktree,['branch','--show-current']),'Detached HEAD cannot publish');
  const candidateFiles = await inventory(path.join(worktree,'testcode',record.candidate.generation));
  for (const filename of candidateFiles) git(worktree,['ls-files','--error-unmatch','--',path.relative(worktree,filename)]);
  git(worktree,['fetch','origin','main']);
  const remote=git(worktree,['rev-parse','refs/remotes/origin/main']);
  git(worktree,['merge-base','--is-ancestor',remote,'HEAD']);
  requireThat(remote === beforeHead,'Publish requires HEAD equal fetched origin/main; root must review any existing outgoing commits');
 }
 const snapshotDir=path.join(worktree,'homepage_versions');
 const entries=await fs.readdir(snapshotDir,{withFileTypes:true});
 const names=entries.filter(entry=>entry.isFile()).map(entry=>entry.name);
 const metrics=snapshotMetrics(original,names,beforeHead);
 const readmePath=path.join(snapshotDir,'README.md');
 const oldReadme=await fs.readFile(readmePath,'utf8');
 requireThat(oldReadme.includes('Before creating a new homepage version'),'Homepage snapshot rules missing');
 const annotation=`\n\n## ${metrics.filename} — Design Freeze\n\nSource commit: ${beforeHead}\nFolder file count before: ${metrics.fileCountBefore}\nHTML snapshot: ${metrics.filename}\nLines: ${metrics.lineCount}; words: ${metrics.wordCount}; characters: ${metrics.characterCount}; bytes: ${metrics.bytes}.\nSHA-256: ${metrics.sha256}\nIntention: ${metrics.intention}\nGeneration: ${record.candidate.generation}. Proof: ${record.proofSha256}.\n`;
 const finding={status:record.status,candidate:record.candidate,proofSha256:record.proofSha256,counts:record.counts,scope:record.scope,homepageRestorePoint:metrics};
 const relativeFinding=`design-freeze/${record.candidate.generation}-${record.proofSha256}.json`;
 const relativeSnapshot=`homepage_versions/${metrics.filename}`;
 const paths=['index.html','homepage_versions/README.md',relativeSnapshot,relativeFinding];
 // Record the restore-point metrics and exact old HTML before touching the homepage.
 await fs.writeFile(path.join(snapshotDir,metrics.filename),original,{flag:'wx'});
 await fs.writeFile(readmePath,oldReadme+annotation);
 await fs.mkdir(path.join(worktree,'design-freeze'),{recursive:true});
 await fs.writeFile(path.join(worktree,relativeFinding),JSON.stringify(finding,null,2)+'\n',{flag:'wx'});
 requireThat(await fs.readFile(homepage,'utf8') === original,'Homepage changed while preparation ran');
 await fs.writeFile(homepage,prepared.html);
 if(!publish) return {status:'PREPARED',paths,metrics,generation:record.candidate.generation,proofSha256:record.proofSha256};
 requireThat(git(worktree,['rev-parse','HEAD']) === beforeHead,'HEAD changed while preparing');
 requireThat(!git(worktree,['diff','--cached','--name-only']),'Index changed while preparing');
 await verifyCandidateTree(pins,worktree,record.candidate.generation);
 await verifyExternalAudit(record,pins);
 git(worktree,['add','--',...paths]);
 requireThat(stable(git(worktree,['diff','--cached','--name-only']).split('\n').sort()) === stable([...paths].sort()),'Staged paths differ from intended publication');
 git(worktree,['commit','-m',`Append Design Freeze ${record.candidate.generation} (${record.proofSha256.slice(0,12)})`]);
 const commit=git(worktree,['rev-parse','HEAD']);
 git(worktree,['push','origin','HEAD:refs/heads/main']);
 return {status:'PUBLISHED',commit,paths,generation:record.candidate.generation,proofSha256:record.proofSha256};
}
if(process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
 const [recordPath,reportPath,pinsPath,worktree,...options]=process.argv.slice(2);
 try {
  requireThat(recordPath && reportPath && pinsPath && worktree && options.every(option=>option==='--publish'),'Usage: node design-freeze-publish.mjs RECORD REPORT PINS WEB_WORKTREE [--publish]');
  console.log(JSON.stringify(await publishFreeze({recordPath,reportPath,pinsPath,worktree,publish:options.includes('--publish')}),null,2));
 } catch(error) { console.error(JSON.stringify({status:'REJECTED',error:String(error)}));process.exitCode=1; }
}
