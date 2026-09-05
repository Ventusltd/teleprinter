"""Offline structural audit of a source-print PDF; never executes extracted code.

Usage: python audit-source-print.py INPUT.pdf OFFLINE_OUTPUT_DIR [--report REPORT.json]
Exit 0: no detected structural failures (not proof of full dependency completeness).
Exit 1: missing/truncated resources or an unsupported/unreadable inventory.
"""
from pathlib import Path
import argparse
import datetime
import hashlib
import json
import re
import sys
import pymupdf


def inspect(filename, output):
    raw = filename.read_bytes()
    with pymupdf.open(stream=raw, filetype="pdf") as pdf:
        pages = [page.get_text() for page in pdf]
        metadata = pdf.metadata
    output.mkdir(parents=True, exist_ok=True)
    text = "\n".join(pages)
    (output / "extracted-text.txt").write_text(text, encoding="utf8")
    # Remove PDF furniture only in the parser's copy; retain original extraction.
    clean = re.sub(r"(?m)^(?:blob:https?://.*|Page \d+ of \d+|\d{2}/\d{2}/\d{4}, \d{2}:\d{2})\s*$", "", text)
    prefix = clean.split("THE LIVE PAGE AS IT STOOD", 1)[0]
    entries = []
    pattern = r"(?m)^\s*(\d+)\.\s+(https?://[\s\S]+?)\s+(\d+)\s+chars\s*\u00b7([\s\S]*?)(?=^\s*\d+\.\s+https?://|^={8,}|\Z)"
    for match in re.finditer(pattern, prefix):
        number, url, size, detail = match.groups()
        url = re.sub(r"\s+", "", url)
        detail = " ".join(detail.split())
        truncated = re.search(r"TRUNCATED to first (\d+)", detail)
        script = "browser (script)" in detail or "+esm" in url or bool(re.search(r"\.(?:m?js)(?:[?#]|$)", url))
        entries.append({"index": int(number), "url": url, "printedOriginalCharacters": int(size),
                        "truncated": bool(truncated), "printedRetainedCharacters": int(truncated[1]) if truncated else None,
                        "script": script, "printedDescription": detail})
    failures = [{"url": url, "printedFailure": failure.strip()} for url, failure in
                re.findall(r"(?m)^-\s+(https?://\S+)\s*\n\s*(HTTP\s+\d+[^\n]*)", prefix)]
    reasons = []
    if not entries or [item["index"] for item in entries] != list(range(1, len(entries) + 1)):
        reasons.append("Inventory missing, non-contiguous, or unsupported: completeness cannot be assessed.")
    declared = re.search(r"NOT READ\s*--\s*(\d+)\s+resource", prefix)
    if declared and int(declared[1]) != len(failures):
        reasons.append("Unread-resource count does not match parsed failure entries.")
    truncated = [item for item in entries if item["truncated"]]
    scripts = [item for item in truncated if item["script"]]
    if failures: reasons.append(f"{len(failures)} dependency failures are printed in the record.")
    if truncated: reasons.append(f"{len(truncated)} resource bodies are explicitly truncated, including {len(scripts)} scripts.")
    generation = re.search(r'"generation"\s*:\s*"(\d+)"', prefix)
    report = {"schema": "codex-offline-source-print-audit-v1", "checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
              "artifact": {"filename": filename.name, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(), "pages": len(pages)},
              "generation": generation[1] if generation else None, "pdfMetadata": metadata,
              "counts": {"inventoryEntries": len(entries), "truncatedResources": len(truncated), "truncatedScripts": len(scripts), "failedResources": len(failures)},
              "ok": not reasons, "reasons": reasons, "resources": entries, "failures": failures,
              "limits": ["Offline only: HTTP failures are what the artifact reports; no live network request is made.",
                         "PDF text is a paginated representation, not original source bytes; no byte-integrity or JavaScript syntax pass is claimed.",
                         "No extracted source is executed. A clean structural audit cannot prove every browser dependency is present."]}
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    if args.output.resolve().is_relative_to(repo):
        parser.error("Extracted source must stay outside the Git repository.")
    try:
        report = inspect(args.input.resolve(), args.output.resolve())
        encoded = json.dumps(report, indent=2, ensure_ascii=True) + "\n"
        (args.output / "audit.json").write_text(encoded, encoding="utf8")
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(encoded, encoding="utf8")
        print(json.dumps({key: report[key] for key in ["generation", "counts", "ok", "reasons"]}))
        return 0 if report["ok"] else 1
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
