/**
 * TELEPRINTER - emit the record exactly as it was.
 *
 * One job: take what the reader is looking at and write it out, at the
 * resolution they are looking at it, in the shape they are looking at it.
 * No paper, no page size, no reflow, no clever processing.
 *
 * Two paths, and the difference between them is stated in every record:
 *
 *   'display'  navigator.mediaDevices.getDisplayMedia(). The reader picks the
 *              tab, the browser hands back the compositor's own output - every
 *              layer, WebGL and DOM alike, at the device's real resolution.
 *              Nothing is reconstructed, so nothing can be reconstructed
 *              wrongly. This is the only path that is honestly a screen grab.
 *
 *   'compose'  Fallback. Draws every canvas at its backing-store size, then
 *              rasterises the DOM above it through an SVG <foreignObject>.
 *              A RECONSTRUCTION, and reported as one. iOS Safari has no
 *              getDisplayMedia at all, so this is what a phone gets.
 *
 * The browser print pipeline is not used anywhere in this file. It differs per
 * browser, it involves a dialog, a destination and a driver, and on the machine
 * this was written for it produced no file at all when a physical printer was
 * selected.
 */
import { imagePdf } from './pdf.js';

const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
};

export const canDisplayCapture = () => Boolean(
  typeof navigator !== 'undefined'
  && navigator.mediaDevices
  && typeof navigator.mediaDevices.getDisplayMedia === 'function'
);

/**
 * One frame of the real screen. Requires a user gesture and a permission
 * prompt; the reader chooses what is shared. Resolves to a canvas at the
 * track's own resolution - never upscaled, never downscaled.
 */
async function captureDisplay() {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 1 },
    audio: false,
    preferCurrentTab: true
  });
  const [track] = stream.getVideoTracks();
  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    /* Two frames, not one: the first can arrive before the compositor has
       painted the tab being shared, and a black first frame is a classic way
       to ship an empty record. */
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const settings = track.getSettings ? track.getSettings() : {};
    const width = video.videoWidth || settings.width || 0;
    const height = video.videoHeight || settings.height || 0;
    if (!width || !height) throw new Error('the capture track reported no dimensions');
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(video, 0, 0, width, height);
    video.pause();
    video.srcObject = null;
    return { canvas, method: 'display', note: '' };
  } finally {
    /* Always stop the track. A live screen-share the reader did not ask to
       keep is worse than a missing file. */
    stream.getTracks().forEach((t) => t.stop());
  }
}

/**
 * Reconstruct the frame. Canvases first at their backing-store resolution (a
 * WebGL context without preserveDrawingBuffer is empty outside the frame that
 * drew it, so each is re-read here rather than trusted), then the DOM over the
 * top through foreignObject.
 */
async function composeFrame(target) {
  const root = target || document.documentElement;
  const ratio = window.devicePixelRatio || 1;
  const width = Math.round(root.clientWidth * ratio);
  const height = Math.round(root.clientHeight * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = getComputedStyle(document.body).backgroundColor || '#000';
  ctx.fillRect(0, 0, width, height);

  const dropped = [];
  for (const source of root.querySelectorAll('canvas')) {
    const box = source.getBoundingClientRect();
    if (!box.width || !box.height) continue;
    try {
      ctx.drawImage(source, box.x * ratio, box.y * ratio, box.width * ratio, box.height * ratio);
    } catch (error) {
      dropped.push(`canvas: ${String(error).slice(0, 60)}`);
    }
  }

  try {
    const clone = root.cloneNode(true);
    clone.querySelectorAll('canvas, script').forEach((node) => node.remove());
    const styles = [...document.styleSheets].map((sheet) => {
      try { return [...sheet.cssRules].map((rule) => rule.cssText).join('\n'); }
      catch { dropped.push('a cross-origin stylesheet'); return ''; }
    }).join('\n');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
      + `<foreignObject width="100%" height="100%">`
      + `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${root.clientWidth}px;height:${root.clientHeight}px;transform:scale(${ratio});transform-origin:0 0">`
      + `<style>${styles}</style>${clone.innerHTML}</div></foreignObject></svg>`;
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('foreignObject did not rasterise'));
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
    ctx.drawImage(image, 0, 0);
  } catch (error) {
    dropped.push(`DOM overlay: ${String(error).slice(0, 60)}`);
  }

  return {
    canvas,
    method: 'compose',
    note: dropped.length ? `reconstruction; dropped ${dropped.join('; ')}` : 'reconstruction'
  };
}

/**
 * @param {object} [options]
 * @param {'pdf'|'png'} [options.format='pdf']
 * @param {number} [options.quality=0.94]   JPEG quality for the PDF path
 * @param {Element} [options.target]        compose path only
 * @param {boolean} [options.download=true]
 * @param {'auto'|'display'|'compose'} [options.method='auto']
 * @returns {Promise<{method:string,width:number,height:number,bytes:number,orientation:string,filename:string,blob:Blob,note:string}>}
 */
export async function teleprint(options = {}) {
  const {
    format = 'pdf', quality = 0.94, target = null,
    download = true, method = 'auto'
  } = options;

  let frame;
  if (method === 'compose' || (method === 'auto' && !canDisplayCapture())) {
    frame = await composeFrame(target);
  } else {
    try {
      frame = await captureDisplay();
    } catch (error) {
      if (method === 'display') throw error;
      frame = await composeFrame(target);
      frame.note = `display capture unavailable (${String(error).slice(0, 70)}); ${frame.note}`;
    }
  }

  const { canvas } = frame;
  const width = canvas.width;
  const height = canvas.height;
  const orientation = width >= height ? 'landscape' : 'portrait';
  const when = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const filename = `teleprint-${stamp()}.${format}`;

  let blob;
  if (format === 'png') {
    blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  } else {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
    const built = imagePdf(binary, width, height, {
      left: `${document.title} - ${location.host}${location.pathname}`,
      right: `${width}x${height} ${orientation} - ${when} UTC - ${frame.method}`
    });
    blob = new Blob([built.bytes], { type: 'application/pdf' });
  }

  if (download) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => { URL.revokeObjectURL(url); link.remove(); }, 30000);
  }

  return {
    method: frame.method, width, height, orientation,
    bytes: blob.size, filename, blob, note: frame.note
  };
}

export default teleprint;
