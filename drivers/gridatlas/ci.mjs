/**
 * OFFLINE CI FOR THE GRIDATLAS TELEPRINTER LANE.
 * ---------------------------------------------------------------------------
 * No network. No browser. No model. One command, a JSON verdict, and an exit
 * code — so the same check runs on this laptop, in a hook, or in a workflow,
 * and gives the same answer.
 *
 * WHY IT EXISTS, AND WHAT IT WOULD HAVE CAUGHT.
 * On 2026-09-05 this lane put a cartridge live that did not parse: a
 * single-quoted string carrying a raw line break. `node --check` had passed on
 * the ES module the cartridge part was flattened from — a DIFFERENT FILE — so
 * nothing caught it. window.initVentusMap never ran and the live Atlas had no
 * map, no menu bar and no layer controls, in every browser. The architect found
 * it, not the tooling.
 *
 * Every check below is therefore about the ARTEFACT THAT SHIPS rather than the
 * source it came from, and each one can fail:
 *
 *   drivers-parse      every driver file parses
 *   part-parses        the GENERATED cartridge part parses
 *   part-matches       the vendored part still matches the drivers it claims
 *                      to be built from (SHA-256 in its own header)
 *   cartridges-parse   every cartridge named in atlas/current.json parses —
 *                      the served bytes, not the parts
 *   gate-refuses       a NEGATIVE CONTROL: a deliberately corrupted driver must
 *                      make the build refuse. A gate that has never been seen
 *                      to fail is not known to work.
 *   no-invented-urls   the source collector must not resolve root-relative
 *                      names against the page, which manufactured
 *                      https://ventusltd.github.io/npm/... and reported three
 *                      dependencies missing that were never missing
 *   tree-declared      the git state is reported, so a green run on a dirty
 *                      tree is visible as one rather than mistaken for a clean
 *                      one
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not open a browser, so it says
 * nothing about whether the page WORKS — only that what ships can be parsed and
 * is what it claims to be. Behaviour is the browser proofs' job
 * (tools/proofs/*.browser.mjs) and it is a separate question. Nothing here
 * touches a physical phone either.
 *
 *   node drivers/gridatlas/ci.mjs <gridatlas-repo> [--json <path>]
 */
import { readFile, writeFile, mkdtemp, mkdir, rm, copyFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DRIVERS = ['screen-frame.js', 'print-pdf.js', 'print-source-code.js',
  'gridatlas-wiring.js', 'build-part.mjs', 'ci.mjs'];

const repo = process.argv[2];
if (!repo) {
  console.error('usage: node drivers/gridatlas/ci.mjs <gridatlas-repo> [--json <path>]');
  process.exit(2);
}
const jsonAt = process.argv.includes('--json')
  ? process.argv[process.argv.indexOf('--json') + 1] : null;

const checks = [];
function record(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
}

function parses(file) {
  const out = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  return { ok: out.status === 0, error: (out.stderr || '').split('\n')[0] };
}

function git(args) {
  const out = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  return (out.stdout || '').trim();
}

/* 1. Every driver parses. */
{
  const bad = [];
  for (const name of DRIVERS) {
    const result = parses(path.join(HERE, name));
    if (!result.ok) bad.push(`${name}: ${result.error}`);
  }
  record('drivers-parse', bad.length === 0,
    bad.length ? bad.join(' | ') : `${DRIVERS.length} files`);
}

/* 2 and 3. The vendored part parses AND still matches its declared sources.
   build-part.mjs --verify answers both: it rebuilds from the drivers and
   compares, and the build refuses to emit anything that does not parse. */
{
  const out = spawnSync(process.execPath,
    [path.join(HERE, 'build-part.mjs'), repo, '--verify'], { encoding: 'utf8' });
  const text = ((out.stdout || '') + (out.stderr || '')).trim();
  record('part-matches', out.status === 0, text.split('\n').slice(0, 3).join(' | '));
}
{
  /* The SERVED part must parse. Superseded parts are immutable history and are
     counted, not judged: three of them do not parse, and that is the permanent
     record of the 2026-09-05 incident rather than a fault to fix. Deleting them
     would be editing a published generation. */
  const current = JSON.parse(await readFile(path.join(repo, 'atlas', 'current.json'), 'utf8'));
  const manifests = current.cartridges.map(c => c.assembled_from).filter(Boolean);
  let servedPart = null;
  for (const manifest of manifests) {
    const text = await readFile(
      path.join(repo, 'atlas', String(manifest).replace(/^\.\//, '')), 'utf8');
    const hit = text.match(/(\d{12}-teleprint-controls\.js)/);
    if (hit) { servedPart = hit[1]; break; }
  }
  if (servedPart) {
    const result = parses(path.join(repo, 'atlas', 'modules', servedPart));
    record('part-parses', result.ok,
      result.ok ? `${servedPart} (served)` : `${servedPart}: ${result.error}`);
  } else {
    record('part-parses', false, 'current.json names no parts manifest carrying the part');
  }
  const all = git(['ls-files', 'atlas/modules'])
    .split('\n').filter(name => /teleprint-controls\.js$/.test(name));
  const broken = all.filter(name => path.basename(name) !== servedPart
    && !parses(path.join(repo, name)).ok).map(name => path.basename(name));
  record('history-declared', true,
    `${all.length} vendored part(s) in history; ${broken.length} do not parse`
      + (broken.length ? ` (${broken.join(', ')}) — superseded, immutable` : ''));
}

/* 4. THE SERVED BYTES. Every cartridge the composition actually names. */
{
  const current = JSON.parse(await readFile(path.join(repo, 'atlas', 'current.json'), 'utf8'));
  const bad = [];
  for (const cartridge of current.cartridges) {
    const file = path.join(repo, 'atlas', cartridge.path.replace(/^\.\//, ''));
    const result = parses(file);
    if (!result.ok) bad.push(`${cartridge.id}: ${result.error}`);
  }
  record('cartridges-parse', bad.length === 0,
    bad.length ? bad.join(' | ')
      : `generation ${current.generation}, ${current.cartridges.length} cartridges`);
}

/* 5. NEGATIVE CONTROL. Corrupt a copy of a driver and require a refusal.
   Done in a temp directory: the real drivers are never touched. */
{
  const scratch = await mkdtemp(path.join(tmpdir(), 'teleprint-ci-'));
  try {
    for (const name of ['screen-frame.js', 'print-pdf.js', 'print-source-code.js',
      'gridatlas-wiring.js', 'build-part.mjs']) {
      await copyFile(path.join(HERE, name), path.join(scratch, name));
    }
    /* The exact 2026-09-05 defect: a single-quoted string broken across two
       lines. It is invisible to a reader and fatal to a parser. */
    const victim = path.join(scratch, 'print-source-code.js');
    const text = await readFile(victim, 'utf8');
    await writeFile(victim, text + "\nconst broken = 'a\nb';\n", 'utf8');
    /* The build reads the target's modules directory before it writes, so the
       control needs a real one — otherwise it fails on a missing path and the
       check passes for the wrong reason, which is the failure mode this whole
       runner exists to prevent. */
    const fakeRepo = path.join(scratch, 'repo');
    await mkdir(path.join(fakeRepo, 'atlas', 'modules'), { recursive: true });
    const out = spawnSync(process.execPath,
      [path.join(scratch, 'build-part.mjs'), fakeRepo],
      { encoding: 'utf8' });
    const said = ((out.stdout || '') + (out.stderr || ''));
    /* It must refuse, and it must refuse FOR THE RIGHT REASON. A build that
       happens to fail because the target directory is missing would satisfy a
       naive "did it exit non-zero" check while proving nothing. */
    const refusedForParse = /does not parse/.test(said);
    record('gate-refuses', out.status !== 0 && refusedForParse,
      refusedForParse ? 'refused a part that does not parse'
        : `exit ${out.status} but not for a parse failure: ${said.split('\n')[0]}`);
    void fakeRepo;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

/* 5b. CALL THE FUNCTIONS.
   `node --check` parses; it does not resolve names. It passed for hours on a
   print-source-code.js that referenced three identifiers which were never
   defined, so every call threw a ReferenceError and the live button was dead.
   Demonstrated: with the defect reinstated, `node --check` still passes and
   this test fails with "ReferenceError: headerLines is not defined". */
{
  const out = spawnSync(process.execPath,
    ['--test', path.join(HERE, 'smoke.test.mjs')], { encoding: 'utf8' });
  const text = (out.stdout || '') + (out.stderr || '');
  const pass = (text.match(/^# pass (\d+)$/m) || [])[1] || (text.match(/pass (\d+)/) || [])[1];
  const fail = (text.match(/^# fail (\d+)$/m) || [])[1] || (text.match(/fail (\d+)/) || [])[1];
  const firstError = (text.match(/(ReferenceError|TypeError|AssertionError)[^\n]*/) || [])[0];
  record('drivers-run', out.status === 0,
    out.status === 0 ? `${pass || '?'} runtime tests passed`
      : `${fail || '?'} failed — ${firstError || 'see node --test output'}`);
}

/* 6. The invented-dependency guard, asserted against the source that ships. */
{
  const text = await readFile(path.join(HERE, 'print-source-code.js'), 'utf8');
  const guarded = /startsWith\('\/'\)[\s\S]{0,80}return;/.test(text);
  record('no-invented-urls', guarded,
    guarded ? 'root-relative names are dropped, not resolved against the page'
      : 'a root-relative name would be resolved against location.href again');
}

/* 7. State the git tree rather than assume it. */
{
  const dirty = git(['status', '--porcelain']).split('\n').filter(Boolean);
  const head = git(['rev-parse', '--short', 'HEAD']);
  record('tree-declared', true,
    `${repo.split(/[\\/]/).pop()} at ${head}, ${dirty.length} uncommitted path(s)`);
}

const failed = checks.filter(check => !check.ok);
const verdict = {
  schema: 'gridatlas-teleprint-ci-v1',
  ranAt: new Date().toISOString(),
  repo,
  network: false,
  browser: false,
  checks,
  passed: checks.length - failed.length,
  failed: failed.length,
  ok: failed.length === 0,
  doesNotEstablish: [
    'that the page works — no browser is opened here',
    'anything about a physical iPhone or Android device',
    'that dependency discovery is complete; a browser cannot prove that'
  ]
};
if (jsonAt) await writeFile(jsonAt, JSON.stringify(verdict, null, 2) + '\n', 'utf8');
console.log(`\n${verdict.passed} passed, ${verdict.failed} failed, ${checks.length} checks`);
console.log(`sha256(this runner) ${createHash('sha256')
  .update(await readFile(path.join(HERE, 'ci.mjs'))).digest('hex').slice(0, 16)}`);
process.exit(verdict.ok ? 0 : 1);
