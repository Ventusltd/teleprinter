/**
 * PRINT PDF -- one PDF unit per captured pixel, and a strip that says where it
 * came from.
 * ---------------------------------------------------------------------------
 * This is the FIRST of the two Teleprinter functions and it is entirely
 * separate from the second. It answers "give me what is on my screen as a
 * file". It knows nothing about source code.
 *
 * NO PAPER. The page box is exactly the captured raster's width, and its
 * height is the raster plus one provenance strip. Not A4, not A3, not "the
 * long edge scaled to 1190pt" -- that last one was real, it shipped, and on a
 * 1390x518 desktop capture it emitted a 1190x443 page: a 14% REDUCTION of the
 * record presented as the record. "THE PRINT MUST BE HIGH RES OF WHAT THE USER
 * SEES NOT A REDUCED CRAP VERSION". "WE ARE NOT USING PAPER".
 *
 * WHY FLATE AND RAW RGB RATHER THAN JPEG. JPEG is lossy, and a lossy record is
 * an edited one: text in the layer panel and the thin 400 kV lines are exactly
 * the content its ringing artefacts damage most. /FlateDecode over raw RGB
 * samples is bit-exact, so the bytes in the file ARE the bytes that were on
 * the screen, and a reviewer can say so rather than hope so.
 *
 * WHY THE STRIP IS OUTSIDE THE IMAGE. The furniture used to be painted over
 * the map. It covered the menu bar at the top and the legend at the bottom,
 * and on a real sheet it truncated the generation stamp to "generation
 * 202609051211 - 2026-09-". The record must not be written on. So the page is
 * made taller than the capture and the strip lives in the space that adds:
 * every pixel of the reader's screen survives untouched, and the provenance is
 * still on the sheet. "I like the headers and footers thats nice ... KEEP
 * THAT".
 */
import { screenFrame } from './screen-frame.js';

const encoder = new TextEncoder();
const bytes = (text) => encoder.encode(text);

function join(parts) {
  let length = 0;
  for (const part of parts) length += part.length;
  const out = new Uint8Array(length);
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}

/* PDF strings are parenthesised, so a literal parenthesis or backslash in a
   project name would end the string early and corrupt every object offset
   after it. Non-ASCII is dropped rather than guessed at: WinAnsi is not UTF-8
   and a mojibake stamp is worse than a plain one. */
function pdfString(text) {
  return String(text == null ? '' : text)
    .replace(/[\\()]/g, '\\$&')
    .replace(/[^\x20-\x7e]/g, '');
}

async function deflate(data) {
  if (typeof CompressionStream !== 'function') {
    throw new Error('This browser cannot compress the page.');
  }
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Build a one-page PDF whose page is the capture plus a provenance strip.
 *
 * @param {{width:number,height:number,rgba:Uint8ClampedArray}} frame
 * @param {{brand?:string,title?:string,url?:string,stamp?:string,credit?:string,method?:string}} [note]
 */
export async function screenPdf(frame, note = {}) {
  const { width, height, rgba } = frame || {};
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
      || width < 1 || height < 1) {
    throw new Error('The captured frame has invalid dimensions.');
  }
  if (!rgba || rgba.length !== width * height * 4) {
    throw new Error('The captured frame has the wrong number of samples.');
  }

  /* The strip scales with the record, not with an assumed sheet: a 2514px-tall
     phone capture and a 518px-tall desktop one both need a legible credit, and
     a fixed 9pt is illegible on one and enormous on the other. */
  const unit = Math.max(1, Math.min(width, height) / 900);
  const headSize = Math.max(9, Math.round(13 * unit));
  const footSize = Math.max(7, Math.round(9 * unit));
  const pad = Math.max(10, Math.round(14 * unit));
  const strip = headSize + footSize + pad * 2 + Math.round(pad * 0.6);
  const pageH = height + strip;

  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, o = 0; i < rgba.length; i += 4, o += 3) {
    rgb[o] = rgba[i]; rgb[o + 1] = rgba[i + 1]; rgb[o + 2] = rgba[i + 2];
  }
  const image = await deflate(rgb);

  const heading = pdfString(note.title || 'GlobalGrid2050 · Grid Atlas');
  const brand = pdfString(note.brand || 'VENTUS · GLOBALGRID2050 · GRID ATLAS');
  const left = pdfString(note.credit || '');
  const right = pdfString([note.stamp, note.method && ('capture: ' + note.method)]
    .filter(Boolean).join('  ·  '));
  const link = pdfString(note.url || '');

  /* The image is placed at y=strip so the strip occupies the BOTTOM of the
     page, below the record, in PDF's origin-at-bottom-left space. */
  const content = [
    'q', `${width} 0 0 ${height} 0 ${strip} cm`, '/Screen Do', 'Q',
    'q', '0.016 0.039 0.047 rg', `0 0 ${width} ${strip} re f`, 'Q',
    `BT /F1 ${headSize} Tf 1 1 1 rg ${pad} ${strip - pad - headSize + Math.round(headSize * 0.25)} Td (${brand}) Tj ET`,
    `BT /F1 ${footSize} Tf 0.86 0.93 0.94 rg ${pad} ${Math.round(pad * 0.9) + footSize} Td (${heading}) Tj ET`,
    `BT /F1 ${footSize} Tf 0.66 0.78 0.80 rg ${pad} ${Math.round(pad * 0.55)} Td (${link}) Tj ET`,
    `BT /F1 ${footSize} Tf 0.66 0.78 0.80 rg ${pad} ${Math.round(pad * 0.55) + footSize + 2} Td (${left}) Tj ET`,
    `BT /F1 ${footSize} Tf 0.86 0.93 0.94 rg ${Math.max(pad, width - pad - right.length * footSize * 0.52)} ${Math.round(pad * 0.9) + footSize} Td (${right}) Tj ET`
  ].join('\n');
  const contentBytes = await deflate(bytes(content));

  const objects = [
    bytes('<< /Type /Catalog /Pages 2 0 R >>'),
    bytes('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    bytes(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${pageH}] `
      + '/Resources << /XObject << /Screen 5 0 R >> /Font << /F1 6 0 R >> >> '
      + '/Contents 4 0 R >>'),
    join([bytes(`<< /Length ${contentBytes.length} /Filter /FlateDecode >>\nstream\n`),
      contentBytes, bytes('\nendstream')]),
    join([bytes('<< /Type /XObject /Subtype /Image '
      + `/Width ${width} /Height ${height} /ColorSpace /DeviceRGB `
      + '/BitsPerComponent 8 /Interpolate false /Filter /FlateDecode '
      + `/Length ${image.length} >>\nstream\n`), image, bytes('\nendstream')]),
    bytes('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  ];

  const chunks = [bytes('%PDF-1.4\n')];
  const offsets = [];
  let at = chunks[0].length;
  objects.forEach((body, index) => {
    offsets.push(at);
    const piece = join([bytes(`${index + 1} 0 obj\n`), body, bytes('\nendobj\n')]);
    chunks.push(piece);
    at += piece.length;
  });
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) xref += String(offset).padStart(10, '0') + ' 00000 n \n';
  chunks.push(bytes(xref + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`
    + `startxref\n${at}\n%%EOF\n`));

  return { bytes: join(chunks), pageWidth: width, pageHeight: pageH, strip };
}

/**
 * Capture the screen and put a PDF of it on the reader's disk.
 *
 * Separate from printSourceCode() on purpose: one produces a picture of the
 * screen, the other produces text for a machine to read, and conflating them
 * gives a reader a file that is bad at both.
 */
export async function printPdf({ capture, note = {}, filename } = {}) {
  const frame = await screenFrame({ capture });
  const built = await screenPdf(frame, { ...note, method: frame.method });
  const blob = new Blob([built.bytes], { type: 'application/pdf' });
  const name = filename
    || `gridatlas-screen-${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  /* Revoking immediately races the browser's own fetch of the blob on some
     builds; 30 s is long enough for any of them and short enough that a reader
     printing repeatedly does not accumulate them. */
  setTimeout(() => {
    URL.revokeObjectURL(url);
    if (link.parentNode) link.parentNode.removeChild(link);
  }, 30000);
  return {
    method: frame.method,
    width: frame.width,
    height: frame.height,
    /* Carried out so the caller can tell the reader the truth about what the
       file holds rather than repeating a "1:1" that describes only the
       relationship between the page and the image inside it. */
    screenWidth: frame.screenWidth || null,
    screenHeight: frame.screenHeight || null,
    captureScale: typeof frame.captureScale === 'number' ? frame.captureScale : null,
    pageWidth: built.pageWidth,
    pageHeight: built.pageHeight,
    bytes: built.bytes.length,
    filename: name
  };
}
