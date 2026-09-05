# Design freeze gate

`design-freeze.mjs` is an offline, fail-closed gate. It never edits a homepage,
commits, pushes, or publishes. `DESIGN FREEZE` means the specified candidate
passed the documented fifty-visit evidence gate; it does not mean a browser
proved universal source dependency completeness or a physical iPhone was tested.

```powershell
node drivers/codex/design-freeze.mjs drivers/codex/fifty-prints-results.json C:/path/to/freeze-pins.json
node drivers/codex/design-freeze.mjs drivers/codex/fifty-prints-results.json C:/path/to/freeze-pins.json --watch=15
node --test drivers/codex/design-freeze.test.mjs
```

Single-run exit status is 0 for acceptance and 1 for rejection. Watch mode is a
Node process, not an agent polling with tokens. It evaluates changed report/pins
bytes, rejects partial reports, and emits `READY` once per accepted proof digest.
Stop with Ctrl+C. If only build inputs or HEAD change after a rejection, rerun
single-shot or restart the watcher. A watcher never performs external actions.

## Pinned inputs

Create this JSON before the run. Paths must be absolute native paths (use
`path.resolve` when building a manifest). Keep the manifest outside `buildRoot`.
The build root is the exact immutable candidate directory that is served.

```json
{
  "candidate": {
    "url": "https://example.org/test-code/202609051800/",
    "generation": "202609051800",
    "sourceCommit": "FULL_SOURCE_COMMIT",
    "engineCommit": "FULL_ENGINE_COMMIT",
    "buildSha256": "SHA256_OF_EXACT_BUILD_MANIFEST_BYTES"
  },
  "heads": [
    {"repo": "C:/path/to/source-repository", "commit": "CURRENT_FULL_HEAD"},
    {"repo": "C:/path/to/teleprinter", "commit": "CURRENT_FULL_HEAD"}
  ],
  "buildRoot": "C:/path/to/immutable-candidate",
  "buildManifestPath": "C:/path/to/build-manifest.json",
  "inputs": [
    {"path": "C:/path/to/build-manifest.json", "sha256": "SHA256_OF_EXACT_BUILD_MANIFEST_BYTES"},
    {"path": "C:/path/to/source-input.js", "sha256": "SHA256_OF_SOURCE_INPUT_BYTES"}
  ],
  "expectedFurniture": {
    "header": ["GLOBALGRID2050"],
    "footer": ["generation", "202609051800"]
  }
}
```

The build manifest is `{"files":[{"path":"ABSOLUTE_NATIVE_FILE_PATH","sha256":"FULL_SHA256"},...]}`.
Include every file recursively in `buildRoot`; only `.git` is ignored. Symlinks
are rejected. The gate checks the directory inventory, every file hash, and the
manifest hash. Pin supplementary code inputs in `inputs`. Both source and engine
commits must exist as ancestors of one recorded HEAD. Source pins can precede
bundle-publication commits; the gate does not demand impossible self-referential
bundles. Expected HEADs, all build files and all input hashes are checked again
after PDF inspection. A publisher must rerun this gate immediately before an
append if time has elapsed; an offline receipt cannot prevent later mutation.

## Report and artifact contract

The existing `fifty-prints-results.json` schema is used directly. Top level needs
`candidate` identical to pins, `finishedAt`, `ok:true`, `browser:"installed Chrome"`,
`requestedScenarios:25`, `expectedVisits:50`, `actualVisits:50`, `savedDownloads:50`.
Exactly 25 unique scenarios each contain one PDF then one source visit and
`pairStateMatches:true`. Each visit needs a unique `visitId`, matching `candidate`,
`browser:"installed Chrome"`, `ok:true`, `closedAt`, `path`, `bytes`, `sha256`, and
actual `state.url`. Pair URL, project and selected layer keys must agree.

Each PDF also needs `pngPath` and `pngSha256`. All 50 downloaded artifacts and
25 original captured PNGs must exist, have distinct paths, and resolve under
`C:/Users/vikra/OneDrive/Desktop/offline-screenshots`. The gate reads them and
checks hashes. It reruns `inspect-pdf.py` on saved PDF/PNG bytes rather than
trusting report flags: embedded pixels and rendered pixels must match, and the
original image must be unscaled with header and footer outside its rectangle.
A separate PyMuPDF read checks configured header/footer text in those outside
regions. Python needs the existing inspector dependencies: PyMuPDF, Pillow,
and pypdf. Missing dependencies reject rather than bypass proof.

Source TXT files are the original downloads, never patched by this gate. It
parses the existing `BEGIN DIAGNOSTIC MANIFEST` JSON and requires current URL,
visible text, form state, viewport and matching `baseManifest.commit`. It checks
exact byte counts/hashes for the PINNED SOURCE, CURRENT DOCUMENT, and every
RESOURCE frame, decoding complete base64 bodies where specified. Every resource
must be `included`, except the selected app's three explicitly represented source
transport files (`APP-source-pin.json`, `APP-source-code.manifest.json`, and
`APP-source-code.txt`). That narrow exception requires exact same-origin/current-
generation URLs, the recorded recursion-prevention exclusion reason, and all
three pinned build files. The pin's app/generation/commit/hash/byte count must
match the embedded base; the original manifest and source bytes must match it
exactly. Sibling bundles and arbitrary exclusions cannot use this exception.
Unavailable dependencies, HTTP-error bodies, manifest
failures, missing frames and hash mismatches reject. Failures remain visible in
the original diagnostic and rejection output. `limitations` and
`discoveryWarnings` are required: known unloaded or computed references are
limitations, distinct from failed fetches. `complete:false` by itself does not
reject because browser discovery cannot prove universal completeness. Runtime
response bytes are those fetched at capture time, not proof of original
execution-time bytes. Source state describes the screen but is not screenshot
pixel evidence. Browser emulation remains distinct from physical-device tests.

## Publication handoff

Accepted records are immutable SHA256-named JSON and Markdown in
`offline-screenshots/design-freeze/`. JSON includes candidate URL/generation,
full source/engine commits, build hash, proof hash, counts and all evidence
paths/digests. The console emits `READY` with the JSON record path; duplicate
proofs do not emit another ready event. Rejection emits reasons and no accepted
record. The gate makes no screenshot/PDF repository writes.

The root publisher should publish each immutable candidate and append a new
homepage row only when its matching record is accepted. Preserve all old
versions and their rows. A candidate failing this gate can be reported as a
candidate with visible findings, but must not be labelled `DESIGN FREEZE` or
`tested code`. Never replace the old working version with an unaccepted one.

## Tests

The pure `evaluateFreeze` tests use in-memory artifact fixtures and injected
inspection results; they do not pretend to be real PDF fidelity tests. The CLI
performs actual saved-file inspection. Negative cases cover fewer than fifty
visits, mutated PDF, missing PNG, bad PNG hash, stale HEAD, changed build manifest,
changed served JS with unchanged manifest, unlisted build file, unreachable
source commit, failed visit, incomplete report, wrong candidate, duplicate visit,
path escape, pixel mismatch, header overlap/wrong text, corrupt framed resource,
and unavailable dependency. No proof can compensate for an incomplete report.
