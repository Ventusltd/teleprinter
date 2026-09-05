# Design freeze homepage publisher

This Codex-owned module turns an accepted freeze into a concrete homepage append.
It reads the offline gate record, reruns `design-freeze.mjs` against the supplied
report and pins, and requires the supplied record to match the gate-produced
record exactly. It verifies that `WEB_WORKTREE/testcode/GENERATION/` exists and
has exactly the pinned build's relative file inventory and bytes.

```powershell
# Default: prepare four reviewable files, no commit or push.
node drivers/codex/design-freeze-publish.mjs RECORD.json REPORT.json PINS.json WEB_WORKTREE

# Explicit one-step preparation + commit + non-force push from a clean checkout.
node drivers/codex/design-freeze-publish.mjs RECORD.json REPORT.json PINS.json WEB_WORKTREE --publish

node --test drivers/codex/design-freeze-publish.test.mjs
```

The module follows `WEB_WORKTREE/homepage_versions/README.md`: before editing the
homepage it calculates folder file count, next numbered snapshot filename,
line/word/character/byte counts, hash, source commit and plain-English intention.
It writes the original HTML to a new `homepage_vNNN.html`, appends measurements
to README, writes a small public finding JSON, and appends the reader-visible
Design Freeze entry. Existing links, rows, JavaScript and historical identities
remain byte-for-byte intact. Design Freeze entries are oldest-first. Identical
generation/proof is idempotent; changing proof for an existing frozen generation
is rejected. Create a new immutable generation for a new frozen version.

The four changed paths are:

- `index.html`
- `homepage_versions/README.md`
- One new `homepage_versions/homepage_vNNN.html`
- One `design-freeze/GENERATION-PROOF_SHA256.json`

The public finding has full candidate/source/engine/build/proof identity, counts,
scope and restore-point measurements. It contains no screenshots, PDF bytes,
source diagnostic content or offline artifact paths. The full evidence remains
under the offline root. The appended row states 50 installed Chrome visits,
25 PDF and 25 source downloads, pixel comparison, and emulation/source limits.
It does not call a partially captured dependency graph universally complete.

## Explicit publishing safeguards

`--publish` is for a clean, fresh preparation. It rejects any existing worktree
changes or staging, requires a named branch, verifies every candidate file is
tracked, fetches `origin main`, checks ancestry and requires HEAD to equal the
fetched remote main before editing. This stronger equality check prevents
unreviewed outgoing commits from riding along with a homepage append.

After preparation it verifies HEAD and index again and rechecks the candidate
tree. It stages only the four named paths, compares the resulting staged path
list, commits, then pushes `HEAD:refs/heads/main` without force. A moved remote
branch causes the normal push rejection. No automatic merge, reset, deletion,
retry, or unrelated staging is performed. A failed push leaves the local commit
for the root publisher to inspect and complete. Preparation errors may leave
new restore-point/finding files; they are deliberately not deleted automatically.

A repeated invocation on an already prepared row returns `ALREADY PREPARED`
and makes no Git changes, even with `--publish`. If you used prepare-only for
review, the root publisher must review and commit/push those four exact files
through its normal publication workflow. Do not assume rerunning `--publish`
will approve or send pre-existing edits. For unattended continuous appends,
consume a new gate `READY` event using the one-step `--publish` invocation in a
clean publication checkout. Every new version must have its own accepted proof.

The module itself was not run to publish during implementation. Eight tests
cover preservation, idempotence, successor order, conflicting proof, incomplete
counts/unsafe URL, ambiguous HTML placement, snapshot measurements, and actual
candidate files with mutation/unlisted-file rejection. These tests do not send
Git pushes; external publication remains an explicitly selected operation.

The explicit publishing path now re-reads every accepted external registry and
its original artifact hashes immediately before staging, in addition to the
initial full gate rerun. Records without an external-review audit, changed
registry bytes, changed resolution proofs or missing/mutated named audit files
cannot publish. Registry hashes remain bound through `pins.inputs`, so the
proof digest formula does not change.
