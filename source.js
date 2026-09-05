/**
 * PRINT SOURCE CODE — the second teleprint.
 *
 * The reader may not code at all. They should be able to press one button on an
 * iPhone and end up with a file they can attach in ChatGPT, or text they can
 * paste, without knowing what GitHub is, what a commit is, or where the files
 * live.
 *
 * So this emits ONE plain .txt file: a header saying what the app is and which
 * exact version this is, then every source file in full, each under a line that
 * names it. Nothing is minified, summarised or truncated — the point is that
 * the reader hands over the real thing and gets an answer about the real thing.
 *
 * Plain text, deliberately. A .txt attaches and pastes everywhere; a .zip does
 * not open on a phone, and a PDF of code is worse to read than the code.
 *
 * It is version-pinned where it can be. If the page is served from GitHub Pages
 * the repository and commit are resolved from the public API and printed in the
 * header, so an answer can always be traced back to the exact bytes it was
 * given. When that cannot be resolved it says so, in the file, rather than
 * printing a commit it guessed.
 */

const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
};

const RULE = '='.repeat(78);

/**
 * github.io hosts one repository per path root. Nothing is guessed: if the
 * host is not a Pages host the identity is reported as unknown.
 */
function repoFromLocation() {
  const host = location.hostname;
  const parts = location.pathname.split('/').filter(Boolean);
  if (host.endsWith('.github.io')) {
    return { owner: host.replace('.github.io', ''), repo: parts[0] || '', from: 'github pages url' };
  }
  return { owner: '', repo: '', from: 'not a github.io host; repository not derivable from the url' };
}

async function resolveCommit(owner, repo, branch = 'main') {
  if (!owner || !repo) return null;
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${branch}`, {
      headers: { Accept: 'application/vnd.github+json' }
    });
    if (!response.ok) return null;
    const body = await response.json();
    return {
      sha: body.sha,
      date: body.commit && body.commit.committer && body.commit.committer.date,
      message: (body.commit && body.commit.message || '').split('\n')[0]
    };
  } catch {
    return null;
  }
}

/**
 * @param {object} [options]
 * @param {string[]} [options.files]  paths relative to the page. Defaults to
 *                                    every same-origin script the page loaded,
 *                                    which is the honest answer to "what is
 *                                    this app running".
 * @param {string} [options.appName]
 * @param {boolean} [options.download=true]
 * @param {boolean} [options.copy=false]  also put it on the clipboard
 * @returns {Promise<{text:string,filename:string,files:number,bytes:number,missing:string[],commit:object|null}>}
 */
export async function printSourceCode(options = {}) {
  const {
    files = null,
    appName = document.title || location.host,
    download = true,
    copy = false
  } = options;

  /* What the page is actually running, taken from the page itself rather than
     from a list someone has to remember to update. */
  const discovered = files || [...document.querySelectorAll('script[src]')]
    .map((node) => node.src)
    .filter((src) => {
      try { return new URL(src, location.href).origin === location.origin; }
      catch { return false; }
    });

  const identity = repoFromLocation();
  const commit = await resolveCommit(identity.owner, identity.repo);

  const head = [
    RULE,
    `SOURCE CODE — ${appName}`,
    RULE,
    '',
    'This file is the complete source of the page it was printed from.',
    'You can attach it to ChatGPT, Claude or Gemini, or paste it in, and ask',
    'about it directly. Nothing has been shortened or rewritten.',
    '',
    `printed (UTC)   ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
    `page            ${location.href}`,
    identity.repo
      ? `repository      ${identity.owner}/${identity.repo}`
      : `repository      not derivable — ${identity.from}`,
    commit
      ? `version         ${commit.sha}`
      : 'version         not resolved — this file is the served code, but its exact commit could not be confirmed',
    commit && commit.date ? `committed       ${commit.date}` : null,
    commit && commit.message ? `change          ${commit.message}` : null,
    `files included  ${discovered.length}`,
    ''
  ].filter((line) => line !== null);

  const chunks = [];
  const missing = [];
  let bytes = 0;

  for (const src of discovered) {
    const shown = (() => {
      try { return new URL(src, location.href).pathname; } catch { return src; }
    })();
    try {
      const response = await fetch(src, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.text();
      bytes += body.length;
      chunks.push([
        '',
        RULE,
        `FILE  ${shown}`,
        `${body.split('\n').length} lines, ${body.length.toLocaleString()} characters`,
        RULE,
        '',
        body
      ].join('\n'));
    } catch (error) {
      /* Named, not silently dropped: a reader must be able to see that
         something is absent from what they handed over. */
      missing.push(`${shown} (${String(error).slice(0, 60)})`);
      chunks.push(['', RULE, `FILE  ${shown}`, `NOT INCLUDED — ${String(error).slice(0, 60)}`, RULE].join('\n'));
    }
  }

  if (missing.length) {
    head.push(`NOT INCLUDED    ${missing.length} file(s) could not be read:`);
    missing.forEach((entry) => head.push(`                ${entry}`));
    head.push('');
  }

  const text = head.join('\n') + chunks.join('\n') + '\n';
  const safe = String(appName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'source';
  const filename = `${safe}-source-${stamp()}.txt`;

  if (download) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => { URL.revokeObjectURL(url); link.remove(); }, 30000);
  }

  if (copy && navigator.clipboard) {
    try { await navigator.clipboard.writeText(text); } catch { /* the file is the deliverable */ }
  }

  return { text, filename, files: discovered.length, bytes: text.length, missing, commit };
}

export default printSourceCode;
