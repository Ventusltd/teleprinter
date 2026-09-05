# AGENTS.md — teleprinter

Two agents are working in this repository at the same time. Read this before
touching anything.

## What is already here, and who wrote it

Committed at `2575d89` by the Claude lane, 2026-09-05:

```
README.md          the spec, the two capture paths, and the limits, stated
teleprinter.js     the screen-capture engine  (Path A display, Path B compose)
pdf.js             a single-image PDF writer, no dependencies
demo.html          open it, press a button, inspect what comes out
test/outcome.mjs   81/81 outcome checks, chromium 151 / firefox 153 / webkit 26.5
```

If a listing showed you only `README.md` and `pdf.js`, you read the directory
mid-write. All five files are committed. `git log` and `git show --stat 2575d89`
are the authority, not a directory listing.

## The two engines the architect asked for

| engine | says on the button | what it does |
|---|---|---|
| **Print** | `Print` | capture the visible screen, emit it as a digital PDF at 1:1 |
| **Print source code** | `Print source code` | emit the version-pinned source as plain text a reader can attach in ChatGPT on a phone |

`teleprinter.js` is the first. The second is not written yet.

**Keep the lingo user-friendly.** The architect was explicit: it is *Print source
code*, not "export". The reader may not code at all — the file has to be
attachable or pasteable from an iPhone with no GitHub knowledge required.

## Lane split, so the two of us do not collide

- **Claude lane:** `teleprinter.js`, `pdf.js`, `demo.html`, `test/outcome.mjs`.
- **Codex lane:** its own directory, as it proposed. Anything under a Codex path
  is Codex's to change.
- **Shared:** `README.md` and this file. Append rather than rewrite, and say
  which lane wrote what.

Neither lane rewrites the other's files without saying so first.

## The rules this repository is built to

**No paper.** There are no page sizes here and no orientation setting. A PDF
page is one unit per captured pixel; portrait and landscape are observations
about the screen, not options. An earlier version scaled the long edge to
1190 pt and turned a 1390×518 capture into a 1190×443 page — a 14 % reduction of
the record for an assumption nobody asked for. Do not reintroduce it.

**No clever processing.** The record is what was on the screen. Not a
re-layout, not a summary, not an improvement.

**Never the browser print pipeline.** It differs per browser, it needs a dialog,
a destination and a driver, and on this machine it produced *no file at all*
with a physical printer selected. Nothing here may depend on `window.print()`.

**Say which path made the record.** `display` is the compositor's own output and
is honestly a screen grab. `compose` is a reconstruction. Every record carries
the distinction in its footer and in the returned metadata, because a record you
cannot trace is not evidence.

**Report measurements, never grades.** No "STRONG", no "GOOD", no "verified"
without the number that earns it.

## Testing

`node test/outcome.mjs` — needs `playwright` resolvable; there is a copy under
`globalgrid2050/uk_renewables_pipeline/v9.7/node_modules`. It serves the repo on
an ephemeral port, drives the real button, waits for the browser's own download
event, saves the file and reads the bytes back.

Those runs exercise the **compose** path only. `getDisplayMedia` needs a
permission grant and a picker, so Path A is verified by hand and the test says
so rather than claiming coverage it does not have. Compose-path *fidelity* is
deliberately not asserted: an arbitrary byte floor is not a fidelity test, and
pretending otherwise is how a green gate stops meaning anything.

## Not done

- **The GitHub repo does not exist.** The remote is set to
  `github.com/Ventusltd/teleprinter` but there is no `gh` CLI and no API token on
  this machine — only the Windows credential manager. Someone with access must
  create it; then `git push -u origin main`.
- **`Print source code` is unwritten.**
- **No physical iPhone test.** iOS Safari has no `getDisplayMedia`, so a phone
  gets the compose path, and that has not been exercised on a real device.

---

## Note from the Claude lane, 202609051414

**I committed Codex's files by accident.** `git add -A` in commit `30575f4`
swept in all eleven `drivers/codex/*` files — in the same commit that added this
document telling both of us not to do that.

`git show --numstat 30575f4 -- drivers/` is **1,132 insertions and 0 deletions**:
they were snapshotted, not modified and not deleted. Nothing of Codex's is lost
and its next commit supersedes that snapshot normally. I have not tried to
surgically remove them, because unpicking a commit someone else is actively
writing into risks real loss for a cosmetic gain.

If that snapshot caught a file mid-write, the committed copy is simply an
earlier state — check `git log -- drivers/codex/<file>` rather than assuming the
working tree is behind.

**Use `git add <path>`, not `git add -A`, in this repository.** Two agents, one
working tree.

### What the Claude lane added in that commit

```
index.js     mount() — both buttons, thumb-sized, phone-first, 48px minimum,
             safe-area aware, hidden from its own capture and from print
source.js    Print source code — one plain .txt, header plus every file in full
```

Both engines are interchangeable with Codex's by design. The contract is only
the two return shapes, documented in the README:

```
teleprint()        -> {method,width,height,orientation,bytes,filename,blob}
printSourceCode()  -> {text,filename,files,bytes,missing,commit}
```

Codex's `drivers/codex/print-screen.js` and `print-source-code.js` appear to
answer the same two questions. If either is stronger, it should win — say so on
this page and swap the import in `index.js`. There is no reason for two of each
to survive.
