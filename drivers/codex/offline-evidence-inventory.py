"""Read existing offline evidence; inspect actual PDFs, never execute captured code."""
from pathlib import Path
import collections
import concurrent.futures
import hashlib
import json
import sys
import time


def inspect_pdf(path):
    import pymupdf
    raw = path.read_bytes()
    result = {'path': str(path), 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
    try:
        with pymupdf.open(stream=raw, filetype='pdf') as doc:
            result['pages'] = len(doc)
            result['pageRecords'] = [{'page': i + 1, 'size': [page.rect.width, page.rect.height],
                                     'images': [[image[2], image[3]] for image in page.get_images()],
                                     'textCharacters': len(page.get_text())} for i, page in enumerate(doc)]
            result['ok'] = True
    except Exception as error:
        result.update(ok=False, error=str(error))
    return result


def main():
    root, output = map(lambda x: Path(x).resolve(), sys.argv[1:3])
    if not output.is_relative_to(root):
        raise ValueError('Write evidence only beneath the supplied offline folder')
    started = time.monotonic()
    files = [p for p in root.rglob('*') if p.is_file() and not p.is_relative_to(output)]
    inventory = collections.defaultdict(lambda: {'files': 0, 'bytes': 0})
    for p in files:
        entry = inventory[p.suffix.lower() or '(none)']
        entry['files'] += 1
        entry['bytes'] += p.stat().st_size
    with concurrent.futures.ProcessPoolExecutor(max_workers=4) as pool:
        pdfs = list(pool.map(inspect_pdf, [p for p in files if p.suffix.lower() == '.pdf']))
    reports = []
    names = {'teleprint-evidence-summary.json', 'campaign-results.json', 'results.json', 'ci-verdict.json', 'ci-verdict-202609051556.json'}
    for p in files:
        if p.name not in names or p.stat().st_size > 10000000:
            continue
        try:
            data = json.loads(p.read_bytes())
            if not isinstance(data, dict):
                continue
            reports.append({'path': str(p), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest(),
                            'recordedClaims': {k: data[k] for k in ['generation', 'base', 'candidate', 'passed', 'failed', 'ok', 'actualVisits', 'savedDownloads', 'summary', 'scope'] if k in data}})
        except (ValueError, OSError):
            continue
    result = {'schema': 'codex-offline-evidence-inventory-v1', 'root': str(root),
              'fileTypes': dict(inventory), 'pdfFiles': len(pdfs), 'pdfReadable': sum(p.get('ok', False) for p in pdfs),
              'pdfPages': sum(p.get('pages', 0) for p in pdfs), 'seconds': round(time.monotonic() - started, 2),
              'pdfs': pdfs, 'priorReports': reports,
              'scope': 'Actual PDF bytes hashed and every page opened, text extracted, image dimensions read. Existing report claims inventoried, not promoted to independently verified passes. No visual fidelity or physical-device claim.'}
    output.mkdir(parents=True, exist_ok=True)
    (output / 'inventory.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf8')
    print(json.dumps({k: result[k] for k in ['pdfFiles', 'pdfReadable', 'pdfPages', 'seconds']}))


if __name__ == '__main__':
    main()
