# iPhone source-print PDF review

This actual user-provided PDF adds three generation-specific source blockers to
`external-evidence.json`. It does not provide original source-file bytes or a
native screen-capture fidelity test.

The exact PDF is 1,998,904 bytes, 591 pages, SHA-256
`a593fba47c52cc481d62dc26a0d24ccb9406c5f8e4c19c78ef022f269b2bcc03`.
An identical copy is retained at
`C:/Users/vikra/OneDrive/Desktop/offline-screenshots/iphone-source-202609061624/202609061624-print-source-code-iPhone.pdf`.
The original repository-directory file is untouched. It is not added to Git.
The new machine-readable review is `IPHONE-SOURCE-EVIDENCE.json`; extraction
text and rendered review pages stay offline beside the copy.

## What the artifact establishes

Page 1 prints live URL `https://ventusltd.github.io/gridatlas/atlas/`, generation
`202609051510`, and capture time `2026-09-05T15:21:39.238Z`. It reports a portrait
440×796 CSS viewport at DPR3, an iPhone Safari user agent, `selectedProject:null`
and `layersOn:[]`. There is no REPD query in this URL. This is an unselected
visit; unlike the previous linked smoke case, null project is not evidence of
a failed requested arrival.

The PDF metadata names Safari and `iOS Version 26.6.1 (Build 23G83) Quartz
PDFContext`, with creation time 2026-09-05 15:22:25Z. This is consistent with the
user's physical-iPhone account. It is a paginated rendering of source text:
all pages measure approximately 595.276×841.890 PDF points and carry Safari
page/URL/time furniture. It is not the app's one-image digital screen PDF.
No new device session was run by this review.

The contents lists 32 included files, three unread resources and 21 truncated
entries. There are 32 actual FILE headings in extracted PDF text. These are
printed counts and independently observed headings, not recovered original
response-byte counts.

## Confirmed source blockers

Page 4 lists four successfully obtained **scripts** as data, truncated to the
first 4,000 characters. The corresponding full body headings confirm the same
policy later in the PDF:

| Module | Original characters printed | Retained characters printed | Body page |
|---|---:|---:|---:|
| DuckDB WASM 1.29.0 `/+esm` | 26,009 | 4,000 | 585 |
| Apache Arrow 17.0.0 `/+esm` | 200,034 | 4,000 | 588 |
| flatbuffers 24.3.25 `/+esm` | 9,269 | 4,000 | 589 |
| tslib 2.6.3 `/+esm` | 10,708 | 4,000 | 590 |

This directly contradicts the page-1 statement that code is never shortened.
The registry records it as `IPHONE-001`, applying only to `202609051510`.

Page 4 has a genuine `NOT READ -- 3 resource(s)` section. It reports HTTP404
for these exact URLs:

- `https://ventusltd.github.io/npm/apache-arrow@17.0.0/+esm`
- `https://ventusltd.github.io/npm/tslib@2.6.3/+esm`
- `https://ventusltd.github.io/npm/flatbuffers@24.3.25/+esm`

These are separate from the listed jsDelivr responses. Their absence is a real
recorded diagnostic failure; it does not by itself establish whether a later
fallback allowed execution to succeed. This is `IPHONE-002`.

Page 3 says `atlas/current.json` has 46,738 characters but keeps only 4,000.
The full live composition/configuration is therefore missing. This is
`IPHONE-003`.

## Limits and gate effect

The registry now hashes this exact offline PDF and checks that it remains
unchanged. The three blockers match generation `202609051510`; no shared-code
byte hash is invented from PDF-extracted text. A different Codex generation
is not vetoed merely because it is another GridAtlas implementation.

PDF text extraction introduces layout breaks, page furniture and encoding
ambiguities. No original JavaScript, source TXT, response-body or build hash is
claimed here. The PDF does demonstrate that source content reached an iPhone
Safari-produced artifact, but not that the complete source or every dependency
was retained. No file-size-only claim about ChatGPT attachment is justified.

This artifact also cannot clear a native capture failure. Exact PDF rendering
of its embedded pixels and the upstream display-capture resolution are
separate checks. A future host-screenshot fifty-visit pass must not be treated
as evidence that a known failing native capture path was corrected; any such
finding needs its own exact candidate applicability and new native proof.
