/**
 * PRINT SOURCE CODE -- the entire source and its dependencies, as the browser
 * actually has them, in one plain text file an AI can read.
 * ---------------------------------------------------------------------------
 * This is the SECOND Teleprinter function and it shares nothing with the
 * first. Print PDF makes a picture of the screen for a person. This makes text
 * for a machine: "the ENTIRE SOURCE CODE AND DEPENDENCIES IN THE BROWSER FOR
 * AI REVIEW", so a reader on a phone can attach one file in ChatGPT and get a
 * real answer about the thing they are looking at.
 *
 * The reader is not assumed to know what GitHub is, what a commit is, or where
 * any of these files live. They press one button and get one .txt.
 *
 * WHY .txt AND NOT .zip OR .pdf. A .zip does not open on an iPhone and cannot
 * be attached to a chat as readable text. A PDF of code is worse to read than
 * code -- it reflows, it loses indentation, and line numbers stop meaning
 * anything. Plain UTF-8 text attaches and pastes everywhere.
 *
 * HOW DEPENDENCIES ARE FOUND, AND WHY THIS WAY. The spine is
 * performance.getEntriesByType('resource') -- what the browser ACTUALLY
 * fetched to build this page -- rather than a scan of the source for things
 * that look like imports. The two disagree in both directions and the
 * disagreement matters:
 *
 *   - a literal scan finds files that were never loaded (a dead import behind
 *     a feature flag, a string that happens to end in .js), and printing them
 *     tells a reviewer the page runs code that it does not;
 *   - the browser's list finds files a scan cannot see: anything assembled at
 *     runtime, a worker started from a blob, a cartridge whose URL is built by
 *     concatenation -- which is exactly how GridAtlas loads its cartridges.
 *
 * The Codex driver in ../codex takes the literal-scan approach deliberately.
 * Where the two disagree, that disagreement is the finding, not a bug.
 *
 * WHAT IT CANNOT DO, STATED IN THE FILE ITSELF. A cross-origin response
 * without CORS is opaque: the browser has the bytes and will not let the page
 * read them. Basemap tiles, some CDN fonts and any third-party script are in
 * that category. Those are LISTED WITH THEIR URL AND THE REASON, never
 * silently dropped and never replaced with a guess -- a reviewer who cannot
 * see a gap will reason as though it is not there.
 */

const MAX_RESOURCES = 400;
const MAX_TOTAL_BYTES = 48 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20000;

/* CODE IN FULL, DATA IN SUMMARY -- and the difference stated in the file.
   ------------------------------------------------------------------------
   The first working version of this printed everything it could read and
   produced a 13,237,685-byte file: 33 resources, of which one was the 10 MB
   decoded REPD dataset. That file is useless for the job it exists to do. The
   architect's purpose is "so we can debug in chatgpt chat on mobile", and no
   phone is attaching 13 MB of mostly numbers to a chat.

   The distinction that fixes it is not "big vs small", it is CODE vs DATA. An
   AI reviewing why a screen is wrong needs every line of the code that drew
   it. It does not need all 7,680 REPD rows to answer that; it needs to know
   the dataset is there, how large it is, and what its first rows look like.

   So code is never truncated -- truncating code is how a reviewer is led to a
   wrong conclusion about a branch they cannot see -- and data is headed,
   measured and marked TRUNCATED in the file itself. */
const CODE = /\.(m?js|cjs|css|html?|svg)(\?|#|$)/i;
const DATA_HEAD_CHARS = 4000;

const TEXTUAL = /\.(m?js|cjs|css|json|html?|txt|svg|map|geojson|csv)(\?|#|$)/i;

function textual(url, type) {
  if (TEXTUAL.test(url)) return true;
  return type === 'script' || type === 'link' || type === 'css' || type === 'fetch'
    || type === 'xmlhttprequest';
}

async function readText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    /* force-cache so printing does not re-download a 10 MB dataset the page
       already has, and so the text printed is the text the page is RUNNING
       rather than whatever the server would serve now. */
    const response = await fetch(url, { cache: 'force-cache', signal: controller.signal });
    if (!response.ok) {
      return { ok: false, reason: `HTTP ${response.status}` };
    }
    if (response.type === 'opaque') {
      return { ok: false, reason: 'opaque cross-origin response; the browser will not let this page read it' };
    }
    return { ok: true, text: await response.text() };
  } catch (error) {
    return { ok: false, reason: String((error && error.message) || error) };
  } finally {
    clearTimeout(timer);
  }
}

/* What is on the screen right now, in words a reviewer can act on. Without
   this the source is a pile of files with no indication of which branch the
   reader was standing in when it went wrong. */
function screenState() {
  const layers = Array.from(document.querySelectorAll('input[type=checkbox]'))
    .filter(node => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    })
    .map(node => {
      const label = node.closest('label') || node.parentElement;
      const text = ((label && label.textContent) || node.name || node.id || '').trim();
      return { control: text.replace(/\s+/g, ' ').slice(0, 80), checked: !!node.checked };
    });
  const selected = document.querySelector('.project-popup .name, .gm-panel .project-name');
  return {
    url: location.href,
    title: document.title,
    generation: (document.documentElement.dataset || {}).gridatlasGeneration || null,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      orientation: window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait'
    },
    userAgent: navigator.userAgent,
    capturedAt: new Date().toISOString(),
    selectedProject: selected ? selected.textContent.trim().slice(0, 160) : null,
    layersOn: layers.filter(l => l.checked).map(l => l.control),
    layersOff: layers.filter(l => !l.checked).map(l => l.control),
    attribution: Array.from(document.querySelectorAll('.maplibregl-ctrl-attrib-inner'))
      .map(n => n.textContent.trim()).filter(Boolean).join(' | ')
  };
}

function discover() {
  const seen = new Map();
  const add = (url, how) => {
    if (!url) return;
    let absolute;
    try { absolute = new URL(url, location.href).href; } catch (_) { return; }
    if (absolute.startsWith('blob:') || absolute.startsWith('data:')) return;
    if (seen.has(absolute)) { seen.get(absolute).how.add(how); return; }
    seen.set(absolute, { url: absolute, how: new Set([how]) });
  };

  add(location.href, 'the page itself');
  for (const node of document.querySelectorAll('script[src]')) add(node.src, '<script src>');
  for (const node of document.querySelectorAll('link[rel~="stylesheet"][href]')) {
    add(node.href, '<link stylesheet>');
  }
  if (typeof performance !== 'undefined' && performance.getEntriesByType) {
    for (const entry of performance.getEntriesByType('resource')) {
      if (textual(entry.name, entry.initiatorType)) {
        add(entry.name, `loaded by the browser (${entry.initiatorType})`);
      }
    }
  }
  return Array.from(seen.values()).slice(0, MAX_RESOURCES);
}

/**
 * Collect everything and render one text file.
 * @returns {Promise<{text:string,filename:string,included:number,missing:Array}>}
 */
export async function collectSourceCode({ appName = 'GridAtlas', inlineDom = true } = {}) {
  const state = screenState();
  const targets = discover();
  const included = [];
  const missing = [];
  let total = 0;

  /* Four at a time. Serial is needlessly slow on a page with fifty
     dependencies; unbounded parallelism on a phone on mobile data drops
     requests and produces gaps that look like defects in the app. */
  for (let i = 0; i < targets.length; i += 4) {
    const batch = targets.slice(i, i + 4);
    const results = await Promise.all(batch.map(async target => {
      const read = await readText(target.url);
      return { target, read };
    }));
    for (const { target, read } of results) {
      if (!read.ok) {
        missing.push({ url: target.url, reason: read.reason });
        continue;
      }
      if (total > MAX_TOTAL_BYTES) {
        missing.push({ url: target.url, reason: 'size budget reached before this file' });
        continue;
      }
      const isCode = CODE.test(target.url) || target.url === location.href;
      const full = read.text;
      const truncated = !isCode && full.length > DATA_HEAD_CHARS;
      const body = truncated ? full.slice(0, DATA_HEAD_CHARS) : full;
      total += body.length;
      included.push({
        url: target.url,
        how: Array.from(target.how).join(', '),
        chars: full.length,
        kind: isCode ? 'code' : 'data',
        truncated,
        text: body
      });
    }
  }

  const rule = '='.repeat(78);
  const lines = [];
  lines.push(rule);
  lines.push(`TELEPRINT OF THE SOURCE CODE -- ${appName}`);
  lines.push(rule);
  lines.push('');
  lines.push('WHAT THIS FILE IS');
  lines.push('  Everything the browser loaded to build the screen this was printed');
  lines.push('  from, in full, plus a description of what was on that screen. It is');
  lines.push('  meant to be attached to an AI chat and asked about directly.');
  lines.push('');
  lines.push('HOW TO USE IT');
  lines.push('  Attach this file in ChatGPT, Claude or Gemini and describe what you');
  lines.push('  saw. You do not need to know how to code, and you do not need GitHub.');
  lines.push('');
  lines.push('WHAT IS NOT HERE');
  lines.push('  Map tiles and any other cross-origin response the browser will not let');
  lines.push('  this page read. Every one of those is listed by URL under NOT READ,');
  lines.push('  with the reason. Nothing has been guessed at or substituted.');
  lines.push('');
  lines.push('  CODE is here in full and is never shortened. DATA files (datasets,');
  lines.push('  GeoJSON, CSV, JSON) are shown as their first ' + DATA_HEAD_CHARS + ' characters and');
  lines.push('  marked TRUNCATED, with their true size given, so this file stays small');
  lines.push('  enough to attach to a chat on a phone.');
  lines.push('');
  lines.push(rule);
  lines.push('THE SCREEN THIS CAME FROM');
  lines.push(rule);
  lines.push(JSON.stringify(state, null, 2));
  lines.push('');
  lines.push(rule);
  lines.push(`CONTENTS -- ${included.length} file(s), ${total} characters`);
  lines.push(rule);
  included.forEach((item, index) => {
    lines.push(`${String(index + 1).padStart(3, ' ')}. ${item.url}`);
    lines.push(`     ${item.chars} chars · ${item.kind}`
      + (item.truncated ? ` · TRUNCATED to first ${DATA_HEAD_CHARS}` : ' · in full')
      + ` · found via ${item.how}`);
  });
  lines.push('');
  if (missing.length) {
    lines.push(rule);
    lines.push(`NOT READ -- ${missing.length} resource(s)`);
    lines.push(rule);
    for (const item of missing) lines.push(`- ${item.url}\n    ${item.reason}`);
    lines.push('');
  }
  if (inlineDom) {
    lines.push(rule);
    lines.push('THE LIVE PAGE AS IT STOOD (document.documentElement.outerHTML)');
    lines.push(rule);
    lines.push(document.documentElement.outerHTML);
    lines.push('');
  }
  for (const item of included) {
    lines.push(rule);
    lines.push(`FILE: ${item.url}`);
    lines.push(`${item.chars} chars · ${item.kind}`
      + (item.truncated
        ? ` · TRUNCATED: the first ${DATA_HEAD_CHARS} characters of ${item.chars} are shown,`
          + ' because this is data rather than code. Nothing has been summarised or'
          + ' rewritten; the rest is simply not here.'
        : ' · shown in full')
      + ` · found via ${item.how}`);
    lines.push(rule);
    lines.push(item.text);
    lines.push('');
  }
  lines.push(rule);
  lines.push('END OF TELEPRINT');
  lines.push(rule);

  return {
    text: lines.join('\n'),
    filename: `${appName}-source-code-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`,
    included: included.length,
    missing,
    state
  };
}

/* OUR OWN WAY OUT, ON EVERY PLATFORM.
   ------------------------------------------------------------------------
   "WE ARE NOT DEPENDENT ON APPLE WE ARE BUILDING OUR OWN NATIVE SOFTWARE OPEN
   SOURCE ON THE WEB." So the primary route is the one WE own: a panel drawn by
   this code, holding the whole teleprint, with its own Copy and Download
   buttons. It cannot be withdrawn by a vendor, it needs no permission, and it
   behaves the same on a phone, a laptop and a tablet.

   The platform's own conveniences are OFFERED, never depended on. A download
   is started because on a desktop that is what a reader expects; a share sheet
   is exposed only where the browser admits it can take a file. If both are
   absent or refused the reader still has the text in front of them, selected,
   with a Copy button under their thumb -- which is the whole point.

   GETTING THE FILE OFF THE PHONE, WHICH IS THE WHOLE POINT.
   ------------------------------------------------------------------------
   The architect's use for this is: print the source on an iPhone, attach it in
   ChatGPT, and show an agent what that phone is actually being served. So the
   delivery path has to work on iOS Safari, where the desktop assumption --
   `a[download]` on a blob URL -- is the least reliable of the four options,
   not the most.

   Four ways out, tried in order, and the returned record names the one that
   worked so a failure on a real device is attributable:

     share      navigator.share({files}) -- the native share sheet, which is
                how a file actually reaches another app on iOS.
     download   a[download] -- correct everywhere else.
     clipboard  navigator.clipboard.writeText -- pasting works even when no
                file ever lands.
     shown      a selectable panel of the text on the page itself. Never
                pretty, always available, and it is the difference between a
                reader who can get their answer and one who cannot.

   THE USER GESTURE IS THE CONSTRAINT. iOS grants share and clipboard only
   inside a real gesture, and this function has to fetch fifty resources first,
   which ends it. So the bytes are prepared when the FILE MENU OPENS and the
   button click only DELIVERS them. That is why prepareSourceCode() and
   deliverSourceCode() are separate exports. */

function downloadText(text, filename) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    if (link.parentNode) link.parentNode.removeChild(link);
  }, 30000);
}

function showTeleprintPanel(text, filename) {
  const existing = document.getElementById('gridatlas-teleprint-fallback');
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
  const box = document.createElement('div');
  box.id = 'gridatlas-teleprint-fallback';
  box.style.cssText = 'position:fixed;inset:5% 4%;z-index:100000;display:flex;'
    + 'flex-direction:column;gap:8px;background:#04141a;color:#eaf4f6;'
    + 'border:1px solid rgba(80,220,240,.4);border-radius:6px;padding:12px;'
    + 'font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace';
  const head = document.createElement('div');
  head.textContent = filename + ' — select all, copy, and paste into your AI chat.';
  const area = document.createElement('textarea');
  area.readOnly = true;
  area.value = text;
  area.style.cssText = 'flex:1 1 auto;width:100%;box-sizing:border-box;'
    + 'background:#02090c;color:#cfeef6;border:1px solid rgba(80,220,240,.25);'
    + 'font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;padding:8px';
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end';
  const button = (label) => {
    const node = document.createElement('button');
    node.type = 'button';
    node.textContent = label;
    /* 44px because a control smaller than that is not reliably hittable with a
       thumb, and this panel exists to be used on a phone. */
    node.style.cssText = 'min-height:44px;padding:0 16px;background:#0b2b33;'
      + 'color:#eaf4f6;border:1px solid rgba(80,220,240,.4);border-radius:4px;'
      + 'font:inherit;cursor:pointer';
    row.appendChild(node);
    return node;
  };
  const copy = button('Copy all');
  copy.setAttribute('data-teleprint', 'copy');
  copy.addEventListener('click', async () => {
    try {
      area.focus();
      area.setSelectionRange(0, area.value.length);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        document.execCommand('copy');
      }
      copy.textContent = 'Copied';
    } catch (_) {
      /* Selection is already made, so the reader can still copy by hand. Say
         that rather than claim a success that did not happen. */
      copy.textContent = 'Selected — press copy';
    }
  });
  const save = button('Download .txt');
  save.setAttribute('data-teleprint', 'download');
  save.addEventListener('click', () => downloadText(text, filename));
  const close = button('Close');
  close.addEventListener('click', () => {
    if (box.parentNode) box.parentNode.removeChild(box);
  });
  box.appendChild(head);
  box.appendChild(area);
  box.appendChild(row);
  document.body.appendChild(box);
  /* Pre-selecting means one tap to "Copy" on a phone rather than a drag
     across half a megabyte of text. */
  try { area.focus(); area.setSelectionRange(0, area.value.length); } catch (_) { /* ignore */ }
  return box;
}

/**
 * Prepare the bytes. Call this when the menu OPENS, not when the button is
 * pressed, so the press is still a user gesture.
 */
export function prepareSourceCode(options = {}) {
  return collectSourceCode(options);
}

/**
 * Deliver already-prepared bytes. Tries share, download, clipboard, then shows
 * the text. Returns which path was used.
 */
export async function deliverSourceCode(collected, { prefer, panel = true } = {}) {
  const filename = collected.filename;
  const text = collected.text;
  const record = {
    filename,
    bytes: new Blob([text]).size,
    included: collected.included,
    missing: collected.missing.length,
    state: collected.state,
    via: [],
    offered: []
  };

  /* OURS FIRST. Whatever any platform does or refuses to do below, the reader
     is now looking at the whole teleprint with a Copy button under it. */
  if (panel) {
    showTeleprintPanel(text, filename);
    record.via.push('panel');
  }

  /* A download is what a desktop reader expects, so it is started -- but
     `download` is advisory, there is no event that says a file was written,
     and a browser that ignores it navigates instead. Recorded as "requested",
     never as "saved". */
  try {
    downloadText(text, filename);
    record.via.push('download-requested');
  } catch (error) {
    record.offered.push('download: ' + String((error && error.message) || error));
  }

  /* Offered, not depended on. canShare({files}) is the only honest test: a
     browser can expose share() and still refuse files. */
  if (prefer === 'share' && typeof navigator !== 'undefined' && navigator.share
      && typeof File === 'function') {
    try {
      const file = new File([text], filename, { type: 'text/plain' });
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        record.via.push('share');
      } else {
        record.offered.push('share: this browser will not share files');
      }
    } catch (error) {
      record.offered.push(error && error.name === 'AbortError'
        ? 'share: the reader cancelled'
        : 'share: ' + String((error && error.message) || error));
    }
  }

  return record;
}

/** Collect and deliver in one call, for callers outside a gesture. */
export async function printSourceCode(options = {}) {
  const collected = await collectSourceCode(options);
  return deliverSourceCode(collected, options);
}
