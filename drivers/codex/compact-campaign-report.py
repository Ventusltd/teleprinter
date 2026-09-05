"""Publish small measured findings while preserving the full receipt offline."""
from pathlib import Path
import hashlib
import json
import sys

source = Path(sys.argv[1])
raw = source.read_bytes()
report = json.loads(raw)
offline = Path(report['output']) / 'campaign-results.json'
offline.write_bytes(raw)
summary = {key: report.get(key) for key in ['candidate', 'createdAt', 'finishedAt', 'ok', 'browser', 'physicalDevices', 'actualVisits', 'savedDownloads']}
summary['fullReceiptSha256'] = hashlib.sha256(raw).hexdigest()
summary['offlineReceipt'] = str(offline)
summary['scenarios'] = []
for scenario in report['scenarios']:
    item = {key: scenario.get(key) for key in ['id', 'kind', 'geometry', 'project', 'layers', 'search', 'pairStateMatches']}
    item['visits'] = [{key: visit.get(key) for key in ['visitId', 'mode', 'ok', 'closedAt', 'bytes', 'sha256', 'pngSha256', 'inspection', 'error']} for visit in scenario['visits']]
    summary['scenarios'].append(item)
Path(sys.argv[2]).write_text(json.dumps(summary, indent=2) + '\n', encoding='utf8')
print(json.dumps({'fullReceiptBytes': len(raw), 'publishedSummaryBytes': Path(sys.argv[2]).stat().st_size, 'ok': report['ok']}))
