/** Print source code from committed Git objects. No working-tree files are read. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const exec = promisify(execFile);
const FORMAT = 'codex-print-source-code-v1';
const POLICY = Object.freeze({
  source: 'Committed Git blobs only; working-tree changes are never substituted.',
  inclusion: 'All regular files and symlink target blobs under each literal scope, including dotfiles and generated files, if valid UTF-8 text.',
  omission: 'NUL-containing or non-UTF-8 blobs and Git submodules are explicitly listed as omitted. No truncation.',
  boundaries: 'File startByte and byteCount identify exact original UTF-8 bytes in the bundle; offsets are zero-based. No newline normalization.',
});
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
function fail(message) { throw new Error(`Print source code: ${message}`); }
async function git(repoDir, args) {
  try {
    return (await exec('git', ['-C', repoDir, ...args], {
      encoding: 'buffer', maxBuffer: 256 * 1024 * 1024, windowsHide: true,
    })).stdout;
  } catch (error) {
    fail(`Git command failed (${args[0]}): ${String(error.stderr || error.message).trim()}`);
  }
}
function scopesOf(paths) {
  if (!Array.isArray(paths) || paths.length === 0) fail('at least one path scope is required');
  return [...new Set(paths.map(path => {
    if (typeof path !== 'string' || !path || path.includes('\\') || path.includes('\0') || path.startsWith('/') || /^[A-Za-z]:/.test(path)) fail('invalid path scope');
    if (path === '.') return path;
    if (path.split('/').some(part => !part || part === '.' || part === '..')) fail(`unsafe path scope: ${path}`);
    return path;
  }))].sort();
}
function githubIdentity(value) {
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(value.trim());
  if (!match) fail('repository identity must be a GitHub HTTPS or SSH repository URL');
  return `https://github.com/${match[1]}`;
}
function header(manifest) {
  return `PRINT SOURCE CODE\nFormat: ${FORMAT}\nRepository: ${manifest.repository}\nCommit: ${manifest.commit}\nTree: ${manifest.tree}\nScopes: ${JSON.stringify(manifest.scopes)}\nPolicy: ${JSON.stringify(POLICY)}\nInventory: ${JSON.stringify(manifest.files.map(({ startByte, ...entry }) => entry))}\n\n`;
}
function begin(file) { return `===== BEGIN FILE ${JSON.stringify(file.path)} | bytes=${file.byteCount} | sha256=${file.sha256} =====\n`; }
function end(file) { return `\n===== END FILE ${JSON.stringify(file.path)} =====\n\n`; }

/** revision is required and resolved once to a full immutable commit SHA. */
export async function createSourceCodeBundle({ repoDir, revision, paths = ['.'], repository } = {}) {
  if (!repoDir || typeof revision !== 'string' || !revision.trim() || revision.startsWith('-')) fail('repoDir and an explicit revision are required');
  const scopes = scopesOf(paths);
  const commit = (await git(repoDir, ['rev-parse', '--verify', '--end-of-options', `${revision}^{commit}`])).toString('utf8').trim();
  const tree = (await git(repoDir, ['rev-parse', '--verify', `${commit}^{tree}`])).toString('utf8').trim();
  const identity = githubIdentity(repository ?? (await git(repoDir, ['remote', 'get-url', 'origin'])).toString('utf8').trim());
  const listing = await git(repoDir, ['ls-tree', '-r', '-z', '--full-tree', commit]);
  let records;
  try { records = utf8.decode(listing).split('\0').filter(Boolean); } catch { fail('Git paths must be valid UTF-8'); }
  const entries = records.map(record => {
    const match = /^(\d+) (blob|commit) ([a-f0-9]+)\t([\s\S]+)$/.exec(record);
    if (!match) fail('unsupported Git tree entry');
    return { mode: match[1], type: match[2], blobOid: match[3], path: match[4] };
  });
  const matches = (entry, scope) => scope === '.' || entry.path === scope || entry.path.startsWith(`${scope}/`);
  for (const scope of scopes) if (!entries.some(entry => matches(entry, scope))) fail(`scope not found at ${commit}: ${scope}`);
  const selected = entries.filter(entry => scopes.some(scope => matches(entry, scope)));
  const bodies = new Map();
  const files = [];
  for (const { type, ...entry } of selected) {
    if (type === 'commit') { files.push({ ...entry, status: 'omitted', reason: 'Git submodule; contents belong to another repository' }); continue; }
    const bytes = await git(repoDir, ['cat-file', 'blob', entry.blobOid]);
    const metadata = { ...entry, byteCount: bytes.length, sha256: digest(bytes) };
    let reason;
    if (bytes.includes(0)) reason = 'Binary blob (contains NUL)';
    else { try { utf8.decode(bytes); } catch { reason = 'Non-UTF-8 blob'; } }
    if (reason) files.push({ ...metadata, status: 'omitted', reason });
    else { files.push({ ...metadata, status: 'included' }); bodies.set(entry.path, bytes); }
  }
  if (!bodies.size) fail('zero text-file coverage for the requested scopes');
  const manifest = { format: FORMAT, repository: identity, commit, tree, scopes, policy: POLICY, files };
  const parts = [Buffer.from(header(manifest))];
  let offset = parts[0].length;
  for (const file of files.filter(file => file.status === 'included')) {
    const prefix = Buffer.from(begin(file));
    const suffix = Buffer.from(end(file));
    file.startByte = offset + prefix.length;
    const bytes = bodies.get(file.path);
    parts.push(prefix, bytes, suffix);
    offset += prefix.length + bytes.length + suffix.length;
  }
  parts.push(Buffer.from('===== END PRINT SOURCE CODE =====\n'));
  const bytes = Buffer.concat(parts);
  manifest.byteCount = bytes.length;
  manifest.sha256 = digest(bytes);
  manifest.includedCount = bodies.size;
  manifest.omittedCount = files.length - bodies.size;
  const text = bytes.toString('utf8');
  verifySourceCodeBundle(text, manifest);
  return { text, manifest };
}

/** Integrity validation; repository-backed validation below also proves inventory coverage. */
export function verifySourceCodeBundle(text, manifest, { expectedRepository, expectedCommit } = {}) {
  if (!manifest || manifest.format !== FORMAT || typeof text !== 'string') fail('unsupported bundle');
  if (expectedRepository && manifest.repository !== expectedRepository) fail('repository mismatch');
  if (expectedCommit && manifest.commit !== expectedCommit) fail('commit mismatch');
  if (!/^[a-f0-9]{40,64}$/.test(manifest.commit) || !/^[a-f0-9]{40,64}$/.test(manifest.tree)) fail('invalid commit/tree identity');
  if (JSON.stringify(manifest.policy) !== JSON.stringify(POLICY)) fail('policy mismatch');
  if (!Array.isArray(manifest.files) || !manifest.files.length) fail('missing inventory');
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length !== manifest.byteCount || digest(bytes) !== manifest.sha256) fail('bundle byte count or SHA256 mismatch');
  const chunks = [Buffer.from(header(manifest))];
  let offset = chunks[0].length;
  let included = 0;
  let omitted = 0;
  const seen = new Set();
  for (const file of manifest.files) {
    if (typeof file.path !== 'string' || seen.has(file.path)) fail('invalid or duplicate inventory path');
    seen.add(file.path);
    if (file.status === 'omitted') { if (!file.reason) fail('omission without reason'); omitted++; continue; }
    if (file.status !== 'included') fail('invalid inventory status');
    included++;
    const prefix = Buffer.from(begin(file));
    if (!Number.isSafeInteger(file.byteCount) || file.byteCount < 0 || file.startByte !== offset + prefix.length) fail(`invalid boundary: ${file.path}`);
    const body = bytes.subarray(file.startByte, file.startByte + file.byteCount);
    if (body.length !== file.byteCount || digest(body) !== file.sha256) fail(`file integrity mismatch: ${file.path}`);
    const suffix = Buffer.from(end(file));
    chunks.push(prefix, body, suffix);
    offset += prefix.length + body.length + suffix.length;
  }
  chunks.push(Buffer.from('===== END PRINT SOURCE CODE =====\n'));
  if (!included || included !== manifest.includedCount || omitted !== manifest.omittedCount || !Buffer.concat(chunks).equals(bytes)) fail('inventory, framing, or coverage mismatch');
  return true;
}

/** Re-read Git objects and require the entire canonical bundle, including omissions, to match. */
export async function verifySourceCodeBundleAgainstRepository(text, manifest, options) {
  verifySourceCodeBundle(text, manifest, { expectedCommit: options.expectedCommit, expectedRepository: options.expectedRepository });
  const expected = await createSourceCodeBundle({ repoDir: options.repoDir, revision: options.expectedCommit ?? manifest.commit, repository: options.expectedRepository ?? manifest.repository, paths: options.paths ?? manifest.scopes });
  if (text !== expected.text || JSON.stringify(manifest) !== JSON.stringify(expected.manifest)) fail('bundle does not match committed repository inventory');
  return true;
}

/** Explicit output locations; text and manifest should be hosted together on one origin. */
export async function writeSourceCodeBundle(options) {
  const { textPath, manifestPath } = options;
  if (!textPath || !manifestPath || resolve(textPath) === resolve(manifestPath)) fail('distinct textPath and manifestPath are required');
  const bundle = await createSourceCodeBundle(options);
  await mkdir(dirname(resolve(textPath)), { recursive: true });
  await mkdir(dirname(resolve(manifestPath)), { recursive: true });
  await writeFile(textPath, bundle.text, 'utf8');
  await writeFile(manifestPath, `${JSON.stringify(bundle.manifest, null, 2)}\n`, 'utf8');
  return bundle.manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [repoDir, revision, textPath, manifestPath, ...paths] = process.argv.slice(2);
  try {
    const result = await writeSourceCodeBundle({ repoDir, revision, textPath, manifestPath, paths: paths.length ? paths : ['.'] });
    process.stdout.write(`Print source code: ${result.includedCount} included, ${result.omittedCount} omitted; commit ${result.commit}\n`);
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
