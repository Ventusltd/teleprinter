"""Parallel CPU-only PDF page decoding/rendering. No network, browser, or AI calls."""
import argparse
import concurrent.futures
import ctypes
import hashlib
import json
import os
from pathlib import Path
import time
import pymupdf

DOCUMENT = None


def initialize(filename):
    global DOCUMENT
    DOCUMENT = pymupdf.open(filename)


def inspect_page(index):
    try:
        page = DOCUMENT[index]
        text = page.get_text().encode("utf8")
        pixmap = page.get_pixmap(matrix=pymupdf.Matrix(96 / 72, 96 / 72), alpha=False)
        pixels = pixmap.samples
        return {"page": index + 1, "textBytes": len(text), "textSha256": hashlib.sha256(text).hexdigest(),
                "width": pixmap.width, "height": pixmap.height, "renderSha256": hashlib.sha256(pixels).hexdigest(),
                "nonuniformPixels": min(pixels) != max(pixels), "ok": bool(text.strip()) and min(pixels) != max(pixels)}
    except Exception as error:
        return {"page": index + 1, "ok": False, "error": str(error)}


def memory_budget():
    if os.name != "nt":
        return 4 * 1024**3
    class Status(ctypes.Structure):
        _fields_ = [("length", ctypes.c_ulong), ("load", ctypes.c_ulong)] + [(name, ctypes.c_ulonglong) for name in
                     ["totalPhys", "availPhys", "totalPage", "availPage", "totalVirtual", "availVirtual", "extended"]]
    status = Status()
    status.length = ctypes.sizeof(status)
    if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
        return 2 * 1024**3
    return status.availPhys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--summary", type=Path)
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(Path(__file__).resolve().parents[2]):
        parser.error("Per-page evidence belongs outside Git.")
    available = memory_budget()
    # Leave memory for the user's apps and concurrent browser campaigns.
    workers = max(1, min((os.cpu_count() or 2) - 2, int(max(0, available - 1536 * 1024**2) / (256 * 1024**2))))
    raw = args.pdf.read_bytes()
    with pymupdf.open(args.pdf) as doc:
        count = len(doc)
    started = time.monotonic()
    with concurrent.futures.ProcessPoolExecutor(max_workers=workers, initializer=initialize, initargs=(str(args.pdf.resolve()),)) as pool:
        pages = list(pool.map(inspect_page, range(count), chunksize=4))
    args.output.mkdir(parents=True, exist_ok=True)
    page_bytes = (json.dumps(pages, indent=2) + "\n").encode()
    (args.output / "page-results.json").write_bytes(page_bytes)
    summary = {"schema": "codex-offline-pdf-sweep-v1", "file": args.pdf.name, "artifactSha256": hashlib.sha256(raw).hexdigest(),
               "workers": workers, "logicalProcessors": os.cpu_count(), "availableMemoryBytesAtStart": available,
               "pages": count, "passed": sum(page["ok"] for page in pages), "failed": [page for page in pages if not page["ok"]],
               "pageResultsSha256": hashlib.sha256(page_bytes).hexdigest(), "seconds": round(time.monotonic() - started, 2),
               "scope": "All PDF pages decoded, text extracted and rasterized at96DPI; no source execution or completeness claim.",
               "ok": all(page["ok"] for page in pages)}
    encoded = json.dumps(summary, indent=2) + "\n"
    (args.output / "summary.json").write_text(encoded, encoding="utf8")
    if args.summary:
        args.summary.write_text(encoded, encoding="utf8")
    print(json.dumps(summary))
    return 0 if summary["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
