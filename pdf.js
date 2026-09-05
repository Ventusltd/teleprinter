/**
 * A single-image PDF, one page, one unit per pixel. No dependency.
 *
 * The image goes in as JPEG with /DCTDecode, which PDF reads natively, so the
 * browser's own encoder output is embedded verbatim and there is no compressor
 * in this file.
 *
 * The page is EXACTLY the pixel dimensions of the frame. Not A4, not "A3-ish",
 * not scaled to a long edge: a viewer at 100% shows the reader's own pixels.
 * An earlier version of this scaled the long edge to 1190pt and turned a
 * 1390x518 capture into a 1190x443 page - a 14% reduction of the record for no
 * reason but an assumption about paper.
 */

const esc = (text) => String(text == null ? '' : text)
  .replace(/\\/g, '\\\\')
  .replace(/\(/g, '\\(')
  .replace(/\)/g, '\\)')
  .replace(/[^\x20-\x7e]/g, '');

/**
 * @param {string} jpegBinary  raw JPEG bytes as a binary string (from atob)
 * @param {number} width       pixels
 * @param {number} height      pixels
 * @param {{left?:string,right?:string}} footer  provenance, drawn over a scrim
 * @returns {{bytes:Uint8Array,width:number,height:number}}
 */
export function imagePdf(jpegBinary, width, height, footer = {}) {
  /* Furniture scaled to the record, not to an assumed sheet, so a 2514px-tall
     phone frame and a 518px-tall desktop one both carry a legible credit. */
  const unit = Math.max(1, Math.min(width, height) / 520);
  const size = Math.round(9 * unit);
  const pad = Math.round(12 * unit);
  const band = Math.round(Math.min(height * 0.12, 34 * unit));
  const left = esc(footer.left || '');
  const right = esc(footer.right || '');
  const rightX = Math.max(pad, width - pad - right.length * size * 0.55);

  const content = [
    'q', `${width} 0 0 ${height} 0 0 cm`, '/Im0 Do', 'Q',
    ...(left || right ? [
      'q', '/GsA gs', '0.02 0.06 0.07 rg', `0 0 ${width} ${band} re f`, 'Q',
      `BT /F1 ${size} Tf 0.9 0.95 0.96 rg ${pad} ${Math.round(band / 2 - size * 0.35)} Td (${left}) Tj ET`,
      `BT /F1 ${size} Tf 0.9 0.95 0.96 rg ${rightX} ${Math.round(band / 2 - size * 0.35)} Td (${right}) Tj ET`
    ] : [])
  ].join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}]`
      + ' /Resources << /XObject << /Im0 5 0 R >> /Font << /F1 6 0 R >>'
      + ' /ExtGState << /GsA 7 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height}`
      + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode'
      + ` /Length ${jpegBinary.length} >>\nstream\n${jpegBinary}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /ExtGState /ca 0.6 >>'
  ];

  let out = '%PDF-1.4\n%âãÏÓ\n';
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(out.length);
    out += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const startxref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((offset) => { out += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;

  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i += 1) bytes[i] = out.charCodeAt(i) & 0xff;
  return { bytes, width, height };
}
