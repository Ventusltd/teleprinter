"""Read PDF structure AND render the page; no PDF/image retained by this check."""
import sys, json, base64, io, hashlib
import pymupdf
from PIL import Image
from pypdf import PdfReader
payload = json.load(sys.stdin)
pdf = base64.b64decode(payload['pdf'])
png = base64.b64decode(payload['png'])
original = Image.open(io.BytesIO(png))
source = original.convert('RGB')
reader = PdfReader(io.BytesIO(pdf), strict=True)
assert len(reader.pages) == 1, 'expected one digital page'
page = reader.pages[0]
assert float(page.mediabox.width) == source.width, 'screen width changed'
assert float(page.mediabox.height) >= source.height, 'screen height cropped'
objects = page['/Resources']['/XObject'].get_object()
assert len(objects) == 1, 'expected only the captured screen'
image = next(iter(objects.values())).get_object()
assert (image['/Width'], image['/Height']) == source.size, 'image downsampled'
raw = image.get_data()
if raw != source.tobytes():
    expected=source.tobytes()
    differences=[(i,raw[i],expected[i]) for i in range(len(raw)) if raw[i]!=expected[i]]
    raise AssertionError(json.dumps({'problem':'embedded screen pixels changed','sourceMode':original.mode,'pngInfo':str(original.info)[:200],'differentChannels':len(differences),'firstDifferences':differences[:12],'maxDifference':max(abs(a-b) for _,a,b in differences),'alphaExtrema':original.getchannel('A').getextrema() if original.mode=='RGBA' else None}))
doc = pymupdf.open(stream=pdf, filetype='pdf')
image_ref=doc[0].get_images()[0][0]
rects=doc[0].get_image_rects(image_ref)
assert len(rects)==1,'screen must appear exactly once'
image_rect=rects[0]
assert (image_rect.width,image_rect.height)==source.size,'screen was scaled'
assert image_rect.x0==0,'unexpected side margin'
furniture=doc[0].rect.height>source.height
if furniture:
    text=doc[0].get_text()
    assert 'GLOBALGRID2050' in text,'approved header missing'
    assert 'generation' in text.lower(),'generation footer missing'
render = doc[0].get_pixmap(matrix=pymupdf.Matrix(1,1), clip=image_rect, alpha=False)
assert (render.width, render.height) == source.size, 'render size differs'
profile=original.info.get('icc_profile')
if profile:
    colour=image['/ColorSpace']
    assert colour[0]=='/ICCBased' and colour[1].get_object().get_data()==profile, 'original colour profile not preserved'
    reference_doc=pymupdf.open(stream=png,filetype='png')
    rect=reference_doc[0].rect
    reference=reference_doc[0].get_pixmap(matrix=pymupdf.Matrix(source.width/rect.width,source.height/rect.height),alpha=False)
    assert (reference.width,reference.height)==source.size
    assert render.samples==reference.samples, 'PDF rendering differs from colour-managed PNG rendering'
else:
    assert render.samples == source.tobytes(), 'rendered PDF differs from screen'
print(json.dumps({'width':source.width,'height':source.height,'pageWidth':doc[0].rect.width,'pageHeight':doc[0].rect.height,'imageRect':list(image_rect),'headersFootersPresent':furniture,'pixels':source.width*source.height,'embeddedPixelsIdentical':True,'colourProfilePreserved':bool(profile),'renderedPixelsIdentical':True,'renderReference':'original PNG through MuPDF colour management' if profile else 'raw RGB screenshot','sha256':hashlib.sha256(pdf).hexdigest()}))
