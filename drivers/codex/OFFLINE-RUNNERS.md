# Offline source-print checks

These runners make no network or AI calls. They write source bodies, page
evidence and extracted text outside Git. Only their code and small findings
reports are published. Run from the Teleprinter repository in PowerShell.

```powershell
python drivers/codex/audit-source-print.py "202609061624-print-source-code-iPhone.pdf" "C:/Users/vikra/OneDrive/Desktop/offline-screenshots/iphone-source-offline-run"
python drivers/codex/offline-pdf-sweep.py "202609061624-print-source-code-iPhone.pdf" "C:/Users/vikra/OneDrive/Desktop/offline-screenshots/iphone-source-offline-run"
python drivers/codex/audit-runtime-source.py "202609051634-GridAtlas-screen-source-code(1).txt" "C:/Users/vikra/OneDrive/Desktop/offline-screenshots/source-txt-202609051634-audit" --repo "C:/Users/vikra/testcode-source-publication"
```

The PDF structural audit exits 1 for truncated or missing resources. The page
sweep independently decodes and renders every page using CPU worker processes;
its worker count reserves RAM for other apps. A readable PDF can still contain
incomplete code. The supplied iPhone PDF passed 591/591 page checks in 7.12
seconds with five workers, but reported 21 truncated resources, four of them
scripts, and three HTTP404 dependency failures.

The original source TXT audit verifies current-document, pinned-source and all
included runtime frames using exact byte counts and SHA256. It checks pinned
files against the optional local Git repository, then parses JavaScript with
`node --check` and JSON with the JSON parser, using up to eight workers. It
does not run extracted JavaScript, import its modules or contact its URLs.
Unknown/broken frame formats fail. The supplied TXT passed 52 source-body
checks, 24 JavaScript parses and 13 JSON parses, including local Git comparison,
in 1.86 seconds. Its recorded view identifies REPD3947 (Bewick Drift) and an
engine-completed badge. A badge is not independent verification of grid maths.

Exact output and original source identity are in
`iphone-pdf-sweep-results.json`, `iphone-source-offline-results.json` and
`source-txt-202609051634-results.json`. No arbitrary attachment-size limit or
universal dependency-completeness claim follows from these passes.

The PDF text audit supports the GridAtlas FILE inventory format. The original
TXT audit supports `codex-runtime-source-v1`. They preserve their respective
formats rather than reconstructing executable source from PDF page layout.

Browser capture has a separate failure record in `NATIVE-CAPTURE-EVIDENCE.md`.
Successful offline parsing or host-screenshot printing cannot clear that
native-resolution requirement for Design Freeze.
