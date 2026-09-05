# Claude GridAtlas evidence review

The two supplied smoke runs are useful independent observations, but neither
qualifies for Design Freeze. Their reported `2/2` means one PDF and one source
file passed the Claude runner's narrow checks. It does not demonstrate fifty
visits, selected-project correctness, complete code dependencies, or an exact
native capture-to-PDF pixel match.

This review is limited to `gridatlas-teleprint-smoke` and
`gridatlas-teleprint-smoke2` under the offline screenshots folder, the actual
`drivers/gridatlas` source, and its GridAtlas runner/composition files. No
other-lane code or freeze gate was edited. Machine-readable findings, all ten
original artifact SHA-256 values, inspected code hashes, and applicability rules
are in `external-evidence.json`. Renders and full measurement inventories are
offline in `offline-screenshots/codex-claude-evidence-review/`.

## Recorded versions and provenance

| Run | Captured source generation | Version | Saved PDF | Saved source TXT |
|---|---|---|---:|---:|
| smoke | 202609051503 | v9.129 | 122,026 bytes | 13,237,685 bytes |
| smoke2 | 202609051510 | v9.130 | 122,027 bytes | 1,983,950 bytes |

The summaries were written at 2026-09-05 15:09:18.787Z and 15:10:51.394Z.
Each records two installed-Chrome sessions, one of each print mode, and says
physical devices, native share sheets and the interactive chooser were not
exercised. The modes use different geometry and project URLs; they are not a
matching-state pair. Runs from different generations cannot be pooled into one
candidate's fifty-visit proof.

GridAtlas commit `05b8eee7658409dc6e012c5cb20e104470a48139` contains the reviewed
v9.129/v9.130 files and runner. Teleprinter driver commit
`07e9f980007a1f59a3a464c3f20fb291f9a8abb7` contains the independent lane.
These are observed containing commits, not original test-time pins: the smoke
summaries provide no complete source commit, engine commit or build digest.
The four main cartridge bodies in each TXT do independently hash-match their
corresponding generation composition and local immutable file: eight matches
out of eight checks. The generation-specific substation cartridge digests are
`8304626dc1b3582ea5482f5b1d66bce04adc7a5882d460091bdb2b367fdc4b7d`
and `2db05c263bc549ef5406a796c4f2c6ba278a92da04fd653f470f58564fdbb936`.
That is valuable limited code provenance, not full dependency coverage.

## PDF: a real improvement, with unresolved capture fidelity

Independent PyMuPDF and pypdf reads find one 786×1762 page with a single
786×1704 image at `(0,0,786,1704)` and a 58-pixel bottom strip. Rendering the
image region reproduces its embedded RGB bytes exactly in both PDFs. Both
embedded images have SHA-256
`3ebc6406d751288a193248a043e94b8a2a32b8c753f77b6dd64124c2734b38cb`.
The PDFs differ in their timestamp furniture. Visual inspection confirms a
nonblank map and menu, with the bottom provenance strip outside the image.

The inspected runner uses the app's File-menu controls and
`getDisplayMedia` with Chrome's auto-accept flags, and the PDF states
`capture: display`. This covers a native display-capture route that Codex's
host-supplied screenshot proof does not itself exercise. It is a useful
additional test route. The browser chooser is automated, not manually tested,
and an emulated phone is still desktop Chrome.

Configured CSS size is 393×852 at DPR3, and the separately saved screenshot is
1179×2556. The PDF image is 786×1704, equivalent to DPR2, two-thirds of the
screenshot width and height. The runner's `widthMatchesCapture` compares the
PDF page width to its own image width, not to the configured resolution or an
independent captured frame. It therefore cannot catch this mismatch.

This does **not** establish that the PDF writer downsampled: `screen-frame.js`
uses `videoWidth`/`videoHeight`, and the PDF writes those dimensions 1:1.
Display capture can supply a different resolution from an emulated screenshot.
The actual track settings and original native frame are not saved, while the
PNG is taken after the download. A reliable native-path proof must retain the
original frame, requested CSS/DPR, actual track settings and dimensions, then
compare embedded/rendered PDF pixels to that exact frame. A later screenshot
at a different resolution cannot substitute for it.

The strip contains brand, title, local URL, time and capture method, but no
generation or full SHA. There is no separate top provenance header. This is
not the existing Codex header-plus-footer proof contract; any intended change
to that contract should be explicit.

## Source: current cartridges are present, but code is missing

Both actual source files have 33 resource frames and a live DOM. Both state
`selectedProject:null` despite `repd_ref=2484` in the URL. Text extracted from
the embedded live DOM contains no `2484`; the pipeline layer controls still say
`SELECT A PROJECT`. This is stronger evidence of an unresolved arrival than a
null field alone, which could also come from an incorrect selector. Neither
run demonstrates the requested selected-project result or its calculations.
The runner waits for menu attachment, then fixed delays; it does not wait for
the project engine to finish or assert the selected project.

Smoke2 truncates **22** frames. Four are observed JavaScript modules, mislabelled
as data because their CDN URLs end in `/+esm` rather than `.js`:

| Loaded script | Original characters stated | Characters retained |
|---|---:|---:|
| DuckDB WASM 1.29.0 | 26,009 | 4,000 |
| Apache Arrow 17.0.0 | 200,034 | 4,000 |
| tslib 2.6.3 | 10,708 | 4,000 |
| flatbuffers 24.3.25 | 9,269 | 4,000 |

The file itself says these were loaded by the browser as scripts. Consequently
its claim that code is never shortened is false for these artifacts. The
46,738-character `atlas/current.json` is also cut to 4,000 characters, losing
the complete composition manifest. Map style/configuration JSON is not
necessarily dispensable to diagnosing the rendered state.

The initial 13,237,685-byte file has no deliberately truncated frames, but that
does not make it byte-complete. The collector uses `response.text()` for binary
PNG/font responses, skips `blob:` and `data:` URLs, does not recursively resolve
module imports, and silently keeps only the first 400 discovered resources.
Neither TXT has original per-resource byte hashes. There are 71,075 Unicode
replacement characters in smoke and 3,513 in smoke2; binary response decoding
is visibly represented as text, not a lossless base64 body. The verified
cartridge matches do not establish fidelity of those binary dependencies or
coverage of worker-only dependencies.

The source runner's `declaresGaps` is literally
`text.includes('NOT READ') || true`, so it cannot fail. Source success checks
only the title marker, at least one FILE, a cartridge name substring, and a
20,000-byte floor. It does not require zero missing resources, complete code,
selected-project state, a full composition, or matching resource hashes.
A reported `notReadCount:0` therefore does not justify universal completeness.

## Attachment rationale must stay measured

No physical phone or ChatGPT attachment attempt was measured. File size alone
does not establish that a 13.2MB text file cannot attach, and this review makes
no claim about an upload limit. The saved inventory also does not contain the
claimed single 10MB decoded REPD dataset. Its largest bodies are a connection-
points JSON of about 2.90MB and grid_132kv GeoJSON of about 2.84MB, followed by
several other network/layer datasets. The report should name what was actually
removed and preserve executable dependencies and composition data. Optional
smaller diagnostic views can be labelled explicitly without replacing the
complete source record or asserting an untested mobile limitation.

## Proposed integration, for root review

Do not import `passed:2` as a positive gate result. Preserve the independently
measured native-route result as supplementary evidence, and add regression
cases for resolution reporting, selected REPD arrival, extensionless CDN modules,
complete composition and binary/worker resources. The main gate still requires
25 PDF plus 25 source visits on one pinned candidate and saved frame/hash proof.

`external-evidence.json` records eight findings with their applicable
generations. A future veto adapter should match the exact candidate generation,
full build/code identity, or demonstrably shared executable hashes. It must not
silently veto a different Codex implementation merely because it uses the same
product name. Historical failures remain reviewable until a matching corrected
candidate produces new offline evidence for the failed scenario. Stale or
unbound observations can require review but cannot confer acceptance.

No automatic veto integration or code changes are made by this report.
