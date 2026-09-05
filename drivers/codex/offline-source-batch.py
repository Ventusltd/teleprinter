"""Verify every downloaded source print from a browser campaign using offline subprocesses."""
import concurrent.futures
import json
from pathlib import Path
import subprocess
import sys
import time

here = Path(__file__).resolve().parent


def main():
    receipt = json.loads(Path(sys.argv[1]).read_bytes())
    output = Path(sys.argv[2]).resolve()
    if output.is_relative_to(here.parents[1]): raise ValueError("Evidence output must be outside Git")
    output.mkdir(parents=True, exist_ok=True)
    repo = Path(sys.argv[3]).resolve()
    sources = [visit for scenario in receipt["scenarios"] for visit in scenario["visits"] if visit["mode"] == "source"]
    if not receipt.get("finishedAt") or len(sources) != 25: raise ValueError("Expected a finished25-source campaign")
    started = time.monotonic()

    def audit(visit):
        destination = output / visit["visitId"]
        command = [sys.executable, str(here / "audit-runtime-source.py"), visit["path"], str(destination), "--repo", str(repo), "--no-extract"]
        run = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=180, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        result = {"visitId": visit["visitId"], "ok": run.returncode == 0, "exitCode": run.returncode}
        report_path = destination / "audit.json"
        if report_path.exists():
            report = json.loads(report_path.read_bytes())
            result.update(artifactSha256=report["artifact"]["sha256"], counts=report["counts"], pinnedGitBytesChecked=report["pinnedGitBytesChecked"])
            if report["artifact"]["sha256"] != visit["sha256"]: result.update(ok=False, error="Downloaded source hash differs from browser receipt")
        else: result["error"] = (run.stdout + run.stderr).decode("utf8", "replace")[-2000:]
        return result

    # Two memory-heavy source parsers; each fans out up to eight light syntax workers.
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(audit, sources))
    report = {"schema": "codex-offline-source-batch-v1", "candidate": receipt["candidate"], "sources": len(results),
              "passed": sum(item["ok"] for item in results), "seconds": round(time.monotonic() - started, 2), "outerWorkers": 2,
              "ok": all(item["ok"] for item in results), "results": results,
              "scope": "Every actual source download rehashed, framed bodies verified, pinned files compared to local Git, JS parsed without execution, JSON parsed. No network or AI calls."}
    encoded = json.dumps(report, indent=2) + "\n"
    (output / "summary.json").write_text(encoded, encoding="utf8")
    (here / "offline-source-batch-results.json").write_text(encoded, encoding="utf8")
    print(json.dumps({key: report[key] for key in ["sources", "passed", "seconds", "ok"]}))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    try: raise SystemExit(main())
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}))
        raise SystemExit(1)
