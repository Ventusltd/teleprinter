import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { screenPdf, getScreenPdfLayout } from './screen-pdf.mjs';

function frame(width = 320, height = 90, transparent = false) {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) rgba.set([i % 251, (i * 7) % 253, (i * 13) % 255, transparent ? i % 256 : 255], i * 4);
  return { width, height, rgba };
}
const furniture = {
  brand: 'VENTUS  GLOBALGRID2050 · GRID ATLAS',
  title: 'Grid Atlas (layer view) \\ full screen',
  credit: 'Data © OpenStreetMap contributors | © CARTO | EV data © Open Charge Map',
  generation: '202609051419',
  capturedAt: '2026-09-05 15:00 UTC',
  url: 'https://example.test/atlas/?project=123&layers=grid,substations',
};
function inspect(pdf, source, layout, { render = true } = {}) {
  const code = `import sys,json,base64,io
from pypdf import PdfReader
import pymupdf
p=json.load(sys.stdin)
data=base64.b64decode(p['pdf']); rgba=base64.b64decode(p['rgba']); layout=p['layout']
r=PdfReader(io.BytesIO(data),strict=True); assert len(r.pages)==1
page=r.pages[0]; image=page['/Resources']['/XObject']['/Screen'].get_object()
rgb=bytes(value for index,value in enumerate(rgba) if index%4!=3)
assert image.get_data()==rgb, 'embedded RGB changed'
assert (image['/Width'],image['/Height'])==(p['width'],p['height'])
assert tuple(map(float,page.mediabox))==(0,0,layout['width'],layout['height'])
if '/SMask' in image: assert image['/SMask'].get_object().get_data()==rgba[3::4]
if isinstance(image['/ColorSpace'],list): assert image['/ColorSpace'][1].get_object()['/N']==3
fonts=page['/Resources'].get('/Font',{})
for name in fonts: assert fonts[name].get_object()['/Subtype']=='/Type1'
doc=pymupdf.open(stream=data,filetype='pdf'); rects=doc[0].get_image_rects(4)
assert len(rects)==1
rect=rects[0]; assert tuple(rect)==(0,layout['headerHeight'],p['width'],layout['headerHeight']+p['height'])
if p['render']:
 pix=doc[0].get_pixmap(matrix=pymupdf.Matrix(1,1),clip=rect,alpha=False)
 assert pix.samples==rgb, 'rendered image crop changed'
 full=doc[0].get_pixmap(matrix=pymupdf.Matrix(1,1),alpha=False)
 if layout['headerHeight']: assert full.samples[:3]==bytes([255,255,255]), 'header is not white'
 if layout['footerHeight']: assert full.samples[-3:]==bytes([255,255,255]), 'footer is not white'
print(json.dumps({'text':page.extract_text(),'fonts':len(fonts),'imageRect':list(rect),'pageHeight':float(page.mediabox.height)}))
`;
  return JSON.parse(execFileSync('python', ['-c', code], { input: JSON.stringify({ pdf: Buffer.from(pdf).toString('base64'), rgba: Buffer.from(source.rgba).toString('base64'), width: source.width, height: source.height, layout, render }), encoding: 'utf8', windowsHide: true, maxBuffer: 4 * 1024 * 1024 }));
}

test('default remains a single exact image with no furniture or fonts', async () => {
  const source = frame();
  const layout = getScreenPdfLayout(source.width, source.height);
  assert.deepEqual(layout.image, { x: 0, y: 0, width: source.width, height: source.height });
  assert.equal(layout.height, source.height);
  const result = inspect(await screenPdf(source), source, layout);
  assert.equal(result.fonts, 0);
  assert.equal(result.text, '');
});

test('white bands contain correctly encoded text outside byte-identical, rendered-identical screen', async () => {
  const source = frame();
  const layout = getScreenPdfLayout(source.width, source.height, furniture);
  const pdf = await screenPdf({ ...source, furniture });
  const raw = Buffer.from(pdf).toString('latin1');
  assert.ok(raw.includes('\\251'), 'copyright must be WinAnsi octal');
  assert.ok(raw.includes('\\267'), 'middle dot must be WinAnsi octal');
  assert.ok(raw.includes('\\(layer view\\)'), 'PDF parentheses must be escaped');
  const result = inspect(pdf, source, layout);
  assert.equal(result.fonts, 2);
  assert.ok(result.text.includes('© OpenStreetMap contributors'));
  assert.ok(result.text.includes('GLOBALGRID2050 · GRID ATLAS'));
  assert.ok(result.text.includes('generation 202609051419'));
  assert.ok(result.text.includes('2026-09-05 15:00 UTC'));
  assert.equal(layout.image.y, layout.footerHeight);
  assert.equal(layout.height, layout.headerHeight + source.height + layout.footerHeight);
});

test('long unbroken URLs and titles wrap without truncation, overlap or horizontal clipping', () => {
  const title = 'A long title (including details) '.repeat(8);
  const url = 'https://example.test/atlas/?long=' + 'abcdefgh0123456789'.repeat(35);
  const settings = { brand: 'VENTUS', title, url, credit: '', generation: '', capturedAt: '' };
  const layout = getScreenPdfLayout(220, 100, settings);
  assert.equal(layout.lines.filter(line => line.band === 'header' && line.font === 'regular').map(line => line.text).join(''), title);
  assert.equal(layout.lines.filter(line => line.band === 'footer').map(line => line.text).join(''), url);
  for (const line of layout.lines) {
    assert.ok(line.x >= 0 && line.x + line.width <= 220);
    if (line.band === 'footer') assert.ok(line.y - line.size * .25 > 0 && line.y + line.size < layout.footerHeight);
    else assert.ok(line.y - line.size * .25 > layout.footerHeight + 100 && line.y + line.size < layout.height);
  }
  const doubled = getScreenPdfLayout(440, 100, { ...settings, scale: 2 });
  const capped = getScreenPdfLayout(440, 100, { ...settings, scale: 4 });
  assert.deepEqual(doubled, capped);
  assert.equal(doubled.lines[0].size, 24);
});

test('ICC and alpha references remain correct when font objects follow them', async () => {
  const profile = new Uint8Array(132);
  new DataView(profile.buffer).setUint32(0, 132);
  profile.set(new TextEncoder().encode('RGB '), 16);
  profile.set(new TextEncoder().encode('acsp'), 36);
  for (const transparent of [false, true]) for (const withProfile of [false, true]) {
    const source = frame(160, 30, transparent);
    const pdf = await screenPdf({ ...source, furniture, ...(withProfile ? { iccProfile: profile } : {}) });
    const result = inspect(pdf, source, getScreenPdfLayout(160, 30, furniture), { render: !transparent && !withProfile });
    assert.equal(result.fonts, 2);
  }
});

test('invalid dimensions, excessive page height, and unusable furniture scale fail', async () => {
  assert.throws(() => getScreenPdfLayout(10, 20, furniture), /too narrow/);
  assert.throws(() => getScreenPdfLayout(320, 14400, furniture), /height limit/);
  assert.throws(() => getScreenPdfLayout(320, 100, { ...furniture, scale: NaN }), /scale/);
  await assert.rejects(screenPdf({ width: 1, height: 1, rgba: new Uint8Array(3), furniture }), /dimensions or pixels/);
});
