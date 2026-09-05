"""Offline verification of original Codex source TXT frames and JS/JSON syntax.
No extracted JavaScript is executed; node --check performs parsing only.
"""
import argparse
import base64
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time
from urllib.parse import urlparse


def digest(data): return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(Path(__file__).resolve().parents[2]):
        parser.error("Extracted source belongs outside Git.")
    args.output.mkdir(parents=True, exist_ok=True)
    raw = args.source.read_bytes()
    started = time.monotonic()
    errors = []
    bodies = []

    def frame(prefix, suffix, count, expected, encoding="utf-8"):
        start = raw.find(prefix.encode())
        if start < 0: raise ValueError("Missing frame: " + prefix[:120])
        start += len(prefix.encode())
        end = raw.find(suffix.encode(), start)
        if end < 0: raise ValueError("Missing frame end")
        encoded = raw[start:end]
        data = base64.b64decode(encoded, validate=True) if encoding == "base64" else encoded
        if len(data) != count or digest(data) != expected: raise ValueError("Frame byte count or SHA256 mismatch")
        return data

    marker = b"===== BEGIN DIAGNOSTIC MANIFEST =====\n"
    begin = raw.index(marker) + len(marker)
    manifest = json.loads(raw[begin:raw.index(b"\n===== END DIAGNOSTIC MANIFEST =====", begin)])
    base = manifest["baseManifest"]
    pinned = frame(f"===== BEGIN PINNED SOURCE | bytes={base['byteCount']} | sha256={base['sha256']} =====\n", "\n===== END PINNED SOURCE =====", base["byteCount"], base["sha256"])
    for item in base.get("files", []):
        if item.get("status") == "omitted" or "startByte" not in item: continue
        data = pinned[item["startByte"]:item["startByte"] + item["byteCount"]]
        if len(data) != item["byteCount"] or digest(data) != item["sha256"]:
            errors.append("Pinned file integrity: " + item["path"])
        bodies.append(("pinned:" + item["path"], data))
    current = re.search(rb"===== BEGIN CURRENT DOCUMENT \| bytes=(\d+) \| sha256=([a-f0-9]{64}) =====\n", raw)
    if not current: raise ValueError("Missing current document")
    frame(current[0].decode(), "\n===== END CURRENT DOCUMENT =====", int(current[1]), current[2].decode())
    represented = []
    for resource in manifest["resources"]:
        if resource["status"] == "already-represented":
            represented.append(resource["url"])
            continue
        if resource["status"] != "included":
            errors.append("Unavailable resource: " + resource["url"])
            continue
        name = json.dumps(resource["url"], ensure_ascii=False, separators=(",", ":"))
        data = frame(f"===== BEGIN RESOURCE {name} | originalBytes={resource['byteCount']} | encoding={resource['encoding']} | sha256={resource['sha256']} =====\n", f"\n===== END RESOURCE {name} =====", resource["byteCount"], resource["sha256"], resource["encoding"])
        bodies.append((resource["url"], data))
    errors.extend(str(error) for error in manifest.get("failures", []))
    unique = {}
    for name, data in bodies: unique.setdefault((name, digest(data)), data)

    def inspect(item):
        (name, sha), data = item
        result = {"name": name, "bytes": len(data), "sha256": sha, "ok": True, "syntax": "not-applicable"}
        pathname = urlparse(name).path
        javascript = pathname.endswith((".js", ".mjs", "/+esm"))
        json_data = pathname.endswith((".json", ".geojson"))
        if javascript:
            run = subprocess.run(["node", "--check", "--input-type=module"], input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30, cwd=args.output, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            result.update(syntax="javascript-parse-only", ok=run.returncode == 0)
            if run.returncode: result["error"] = run.stderr.decode("utf8", "replace")[:2000]
        elif json_data:
            result["syntax"] = "json"
            try: json.loads(data)
            except Exception as error: result.update(ok=False, error=str(error))
        (args.output / (sha + (".mjs" if javascript else ".json" if json_data else ".bin"))).write_bytes(data)
        return result

    workers = min(8, max(1, (os.cpu_count() or 2) // 2))
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        results = list(pool.map(inspect, unique.items()))
    errors.extend(result["name"] + ": " + result["error"] for result in results if not result["ok"])
    state = manifest["state"]
    badge = re.search(r"TEST CODE [^\n]+ENGINE COMPLETED[^\n]*", state.get("visibleText", ""))
    report = {"schema": "codex-offline-runtime-source-audit-v1", "artifact": {"filename": args.source.name, "bytes": len(raw), "sha256": digest(raw)},
              "url": state.get("url"), "capturedAt": state.get("capturedAt"), "sourceCommit": base.get("commit"),
              "viewport": state.get("viewport"), "printedEngineBadge": badge[0] if badge else None,
              "workers": workers, "seconds": round(time.monotonic() - started, 2),
              "counts": {"verifiedBodies": len(bodies), "javascriptChecks": sum(r["syntax"] == "javascript-parse-only" for r in results), "jsonChecks": sum(r["syntax"] == "json" for r in results), "failures": len(errors)},
              "representedSourceTransport": represented, "ok": not errors, "errors": errors, "results": results,
              "limitations": manifest.get("limitations", []) + ["Offline syntax parsing does not execute code or validate grid mathematics.", "Self-consistent hashes do not independently authenticate a GitHub deployment.", "Browser discovery cannot prove universal dependency completeness."]}
    encoded = json.dumps(report, indent=2, ensure_ascii=True) + "\n"
    (args.output / "audit.json").write_text(encoded, encoding="utf8")
    if args.report: args.report.write_text(encoded, encoding="utf8")
    print(json.dumps({key: report[key] for key in ["counts", "workers", "seconds", "ok", "printedEngineBadge"]}))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    try: raise SystemExit(main())
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}))
        raise SystemExit(1)
