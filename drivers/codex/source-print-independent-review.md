# Independent review of the actual downloaded source print

Reviewed 2026-09-05. Source was treated as data, never executed. No implementation changes were made by this review.

Artifact: `C:/Users/vikra/OneDrive/Desktop/offline-screenshots/teleprinter-2026-09-05T14-52-04-724Z-7712/01-atlas-desktop-wide-source.txt`

SHA256: `807f3e4e9c639bc5b6014ec21add24634a6c069de160fc2295b8a809f7942a3f`; **51,696,851 bytes**. All references below are to this downloaded TXT, not the repository working copy. Extracted readable module copies remain beside the artifact offline.

## Checks and current state

Independently decoded the manifest, verified all **48 resource bodies** against their declared original byte counts and SHA256 hashes, the **998,460-byte pinned source** hash, all **15 pinned file hashes**, and the **165,001-byte current document** hash. Pinned commit is `86b0bd447d1d0d4039981b89f4980d1ece8c3296`; pinned scope has 15 included files and 0 omitted within that selected scope.

`state.capturedAt` is `2026-09-05T14:52:10.164Z`; URL identifies Atlas project REPD 2484, offshore wind, latitude 52.6199968 and longitude 2.5499934. Viewport is 1440 by 900, DPR 1, zero scroll. Map center is longitude 1.7822546991958461, latitude 52.42685873588161, zoom 8.5, bearing/pitch zero. There are 199 serialized form controls and 194 map layers.

The form records genuinely preserve live checked properties, separately from HTML attributes: matching form indices to the CURRENT DOCUMENT shows index 0 `data-layer-id="400"`, index 1 `data-layer-id="275"`, and index 6 `data-layer-id="subs"` are checked. Proxy indices 65, 66 and 71 agree. Map `l-400` and `l-275` are visible. This is evidence of selected layers and current state, not just unchanged repository source.

## Findings requiring attention

1. **A selected map dependency is missing.** `state.map.sources["src-400"].data` is `../cartridges/5f5fbec83f9ce307b47ddc6e7277743f0bba1a2445b0f3ca50a9a1806146e993/grid_400kv.geojson`, but none of the 51 resource inventory entries or 48 body blocks contains that resource. The 275 kV source, by comparison, contains its GeoJSON inline in map state and has a fetched body. The printed runtime-source.js, lines 109?119 in its RESOURCE block, discovers page performance entries and DOM script/style/image/frame references; it never queues URL-valued map source data. Fix: explicitly discover map source URLs using their actual base (the captured documentBase is `https://ventusltd.github.io/gridatlas/atlas/releases/202608300453-atlas-v9/`), and test the selected 400 kV body is included.

2. **Worker fetches remain outside demonstrated coverage.** The inventory contains Carto style/TileJSON, sprite and font bodies, but no numbered vector tile body. The printed bridge creates a Worker from a computed URL and calls `database.instantiate(bundle.mainModule, bundle.pthreadWorker)`; no WASM body is included. The artifact alone cannot establish which WASM assets actually executed. Page-only resource discovery cannot substantiate all worker dependencies. Fix: collect worker resources at integration time or explicitly enumerate observed worker gaps; do not upgrade completeness based on zero fetch failures.

3. **Form identities require positional joining.** The live records for the selected layer checkboxes have empty id/name and value `on`; only their index joins them to `data-layer-id` in CURRENT DOCUMENT. Add relevant data attributes or stable locator/label to form records so a reader can directly identify selected layers. This is a usability defect, not lost checked state in this artifact.

4. **Mobile transfer is not established by this print.** The complete TXT is 51.7 MB. The printed print-source-code.js decodes all bytes into one clipboard string and uses the entire File for sharing; it does preserve the later click gesture and offers manual copy when clipboard fails. No truncation was found. Show actual byte size before transfer and measure this artifact on a physical phone before claiming attachment/copy works there. Large inline map data plus pretty-printed state contributes materially to size; any compacting should remain lossless.

## Explicit limits and screen-print behavior

The manifest correctly says `complete:false`, `observedResourcesComplete:false`: 51 resources, 48 included response bodies, 3 transport exclusions, 2 HTTP-error responses and 4 nonliteral-import warnings. The errors are local `/favicon.ico` and `/__testcode/receipt`, both GET 404 response bodies included. The pinned 15-file inventory is not all runtime dependencies. Refetched bodies are explicitly labelled as capture-time bytes, not execution-time evidence.

The printed runtime collector snapshots when preparation runs after opening Teleprinter, and reuses those prepared bytes for later download/copy/share. It does not traverse shadow roots; the Teleprinter dialog itself is therefore absent from CURRENT DOCUMENT. Map state is a description, not canvas pixels or a replay package.

The printed controls.js closes the dialog and calls the same printScreen function for File > Print and Teleprinter Print. The printed print-screen.js accepts a whole browser screenshot provider, getDisplayMedia frame, or device screenshot; it does not use a map-canvas-only or browser-print route. On unsupported mobile self-capture it requires a user screenshot. This source review does not independently certify the PDF pixel result or physical-device capture/share behavior.


## Updated actual download: 2026-09-05 14:58 UTC

The initial findings above remain as history. This follow-up independently reads the new downloaded TXT:
`C:/Users/vikra/OneDrive/Desktop/offline-screenshots/teleprinter-2026-09-05T14-58-37-654Z-46504/01-atlas-desktop-wide-source.txt`

SHA256: `84a61c2e90d283eeeba8a86089399cc816ac0d1bec891f0172440300021cc802`; **60,274,028 bytes**. Verified all **45 included resource bodies**, the **1,008,574-byte pinned bundle**, all **15 pinned file hashes**, and the **165,175-byte current document** against their recorded hashes and lengths. Pinned commit is `0bed878926fb027e6db05d6d5c49c4261ff5120c`.

**The selected 400 kV omission is fixed in this artifact.** Its full RESOURCE body is HTTP 200, UTF-8 GeoJSON, **1,469,267 bytes**, SHA256 `2d49252770d55185c3825425d79de992b85f2c8ddfe69eba37a32311407053b1`. Independently parsing that exact body yields a FeatureCollection with **4,106 features**. The URL resolves to `https://ventusltd.github.io/gridatlas/atlas/releases/cartridges/5f5fbec83f9ce307b47ddc6e7277743f0bba1a2445b0f3ca50a9a1806146e993/grid_400kv.geojson`; its discovery record explicitly identifies live map source src-400 and visible layer l-400.

The captured view is generation `202609051457`, REPD 2484, at `http://127.0.0.2:8887/testcode/202609051457/atlas/?repd_ref=2484&technology=wind_offshore&latitude=52.6199968&longitude=2.5499934`, captured `2026-09-05T14:58:43.207Z`. Viewport remains 1440 by 900, DPR 1, zero scroll. Live forms still show 400 kV, 275 kV and substations checked at document indices 0, 1 and 6; map l-400 and l-275 remain visible. Form root identity is now recorded, but label/data-layer identity still requires joining the index to CURRENT DOCUMENT.

**Open shadow state is now present.** `state.openShadowRoots[0].path` is `document/DIV#codex-teleprinter::shadow`; its HTML contains the open Teleprinter dialog and controls. Its file input is separately recorded under that root with id image and an empty files list. This is a separate manifest section rather than declarative shadow content inside CURRENT DOCUMENT; readers must inspect both sections.

The printed controls.js includes the actual File-menu integration: it creates a `data-codex-print-source="1"` button, labels it Print source code, and on click calls openSource(), waits for current.ready, then invokes the source download control if that same dialog remains open. The captured open shadow dialog matches this preparation flow. The TXT can substantiate this implementation and resulting state; the runner's browser-download event is the separate evidence that File > Print source code actually triggered this particular file.

The updated manifest records **48 discovered resources, 45 included bodies, 3 transport exclusions, and zero failures**. It still correctly reports **complete:false** and **observedResourcesComplete:false**, with **11 discovery warnings**. These now explicitly identify the unproven rendered worker tile set, unresolved satellite/glyph/Carto tile URL templates, and nonliteral dynamic imports. `state.resourceTiming` records 44 entries, historyComplete false and workerRequestsGuaranteed false. Thus the concrete selected GeoJSON gap is repaired and worker limitations are better disclosed; exact basemap tiles and all execution-time worker dependencies are still not demonstrated.

Mobile size/transfer remains unmeasured: the new file grew from 51,696,851 to 60,274,028 bytes. File-menu automatic download now occurs after asynchronous preparation; Chrome's successful download does not establish Safari's behavior for that path. Copy/share remain separate user controls after preparation. No claim of physical iPhone attachment, clipboard, native sharing, or complete dependency replay is earned by this artifact. This review made no source implementation edits and did not re-certify the PDF separately.
