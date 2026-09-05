"""Read PDF structure AND render the page; no PDF/image retained by this check."""
import sys, json, base64, io, hashlib
import pymupdf
from PIL import Image
from pypdf import PdfReader
payload = json.load(sys.stdin)
pdf = base64.b64decode(payload['pdf'])
png = base64.b64decode(payload['png'])
source = Image.open(io.BytesIO(png)).convert('RGB')
reader = PdfReader(io.BytesIO(pdf), strict=True)
assert len(reader.pages) == 1, 'expected one digital page'
page = reader.pages[0]
assert tuple(map(float, page.mediabox)) == (0,0,*source.size), 'page dimensions changed'
objects = page['/Resources']['/XObject'].get_object()
assert len(objects) == 1, 'expected only the captured screen'
image = next(iter(objects.values())).get_object()
assert (image['/Width'], image['/Height']) == source.size, 'image downsampled'
raw = image.get_data()
assert raw == source.tobytes(), 'embedded screen pixels changed'
doc = pymupdf.open(stream=pdf, filetype='pdf')
render = doc[0].get_pixmap(matrix=pymupdf.Matrix(1,1), alpha=False)
assert (render.width, render.height) == source.size, 'render size differs'
assert render.samples == source.tobytes(), 'rendered PDF differs from screen'
print(json.dumps({'width':source.width,'height':source.height,'pixels':source.width*source.height,'embeddedPixelsIdentical':True,'renderedPixelsIdentical':True,'sha256':hashlib.sha256(pdf).hexdigest()}))
