"""Compare an app-render PDF with an independent browser screenshot; not exact pixel equivalence."""
import base64,io,json,sys
import pymupdf
import numpy as np
from PIL import Image
p=json.load(sys.stdin)
d=pymupdf.open(stream=base64.b64decode(p['pdf']),filetype='pdf')
assert len(d)==1
images=d[0].get_images();assert len(images)==1
pix=pymupdf.Pixmap(d,images[0][0]);actual=np.asarray(Image.frombytes('RGB',[pix.width,pix.height],pix.samples)).astype('int16')
reference=np.asarray(Image.open(io.BytesIO(base64.b64decode(p['png']))).convert('RGB')).astype('int16')
assert actual.shape==reference.shape,(actual.shape,reference.shape)
rect=d[0].get_image_rects(images[0][0])[0]
assert rect.width==pix.width and rect.height==pix.height and rect.y0>0 and rect.y1<d[0].rect.height
assert 'GLOBALGRID2050' in d[0].get_text()
h,w=actual.shape[:2];regions={'whole':(0,0,w,h),'menu':(0,0,w,max(1,round(h*.06))),'left':(0,0,w//3,h),'middle':(w//3,0,w*2//3,h),'right':(w*2//3,0,w,h)}
scores={}
for name,(x,y,x2,y2) in regions.items():
 a,b=actual[y:y2,x:x2],reference[y:y2,x:x2]
 score=float(np.mean(np.max(np.abs(a-b),axis=2)<=32));scores[name]=score
 assert score>=.85,(name,score)
assert np.std(actual)>5,'Blank app image'
print(json.dumps({'width':w,'height':h,'imageUnscaled':True,'furnitureOutsideImage':True,'fractionWithin32PerChannel':scores,'scope':'Approximate app-render comparison, threshold85% per region; not browser compositor pixel equivalence.'}))
