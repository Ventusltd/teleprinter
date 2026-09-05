/**
 * GET THE FRAME THE READER IS LOOKING AT.
 * ---------------------------------------------------------------------------
 * One job, and one refusal.
 *
 * The job: return the pixels currently on the reader's screen, with their real
 * dimensions and a note saying HOW they were obtained.
 *
 * The refusal: this never reconstructs the page. There is a tempting shortcut
 * -- serialise the DOM into an <svg><foreignObject>, draw that to a canvas, and
 * call the result a screenshot. It is not one. It drops cross-origin images,
 * loses most pseudo-elements, cannot see into shadow roots, and silently
 * substitutes fallback fonts. A reader handed that would be looking at a
 * drawing of their screen while being told it was a record of it, which is the
 * one thing a teleprinter must never do. If no honest frame can be had, this
 * throws and the caller says so.
 *
 * TWO SOURCES, IN ORDER, AND THE RECORD ALWAYS NAMES THE ONE USED
 *
 *   'host'     a capture function supplied by the embedder. This exists so a
 *              test harness can hand in the browser's own screenshot and
 *              exercise every downstream byte without a permission chooser --
 *              and so a future native shell can supply a real device grab.
 *
 *   'display'  navigator.mediaDevices.getDisplayMedia({preferCurrentTab:true}).
 *              The compositor's own output: every layer, WebGL and DOM
 *              together, at the resolution the reader is actually looking at.
 *              Costs one permission click. That click is the price of an
 *              honest record and it is worth paying.
 *
 * WHY NOT canvas.toDataURL ALONE. GridAtlas draws its map into a WebGL canvas
 * created without preserveDrawingBuffer, so the drawing buffer is gone by the
 * time anything outside the frame that drew it goes looking. Reading it gives
 * a fully transparent image that encodes to a perfectly valid, perfectly blank
 * PNG. That is the failure that produced white sheets, and it is why a canvas
 * read is a MAP source, never a SCREEN source.
 */

/** Milliseconds to wait for the capture track to actually produce a frame. */
const FRAME_TIMEOUT_MS = 10000;

/* A display track that never paints must not hang the reader's browser
   forever. Chrome will happily keep an unstarted <video> pending, so the wait
   is bounded and the tracks are stopped whatever happens -- an abandoned
   capture leaves the tab's sharing indicator lit, which reads to the reader as
   "this page is still watching my screen". */
function stopTracks(stream) {
  if (!stream || typeof stream.getTracks !== 'function') return;
  for (const track of stream.getTracks()) {
    try { track.stop(); } catch (_) { /* already stopped */ }
  }
}

function pixelsFromSource(source, width, height) {
  if (!width || !height) throw new Error('The captured frame has no size.');
  /* 40 megapixels is about a 8K screen at dpr 2. Past that the RGBA buffer
     alone is 160 MB and the tab is more likely to die than to print. */
  if (width * height > 40000000) {
    throw new Error('The screen is too large to print in one page.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('This browser refused a 2D context.');
  context.drawImage(source, 0, 0, width, height);
  return { width, height, rgba: context.getImageData(0, 0, width, height).data };
}

async function fromDisplay() {
  const media = navigator.mediaDevices;
  if (!media || typeof media.getDisplayMedia !== 'function') {
    throw new Error('This browser cannot capture the screen. '
      + 'On an iPhone, take a screenshot and use "Print a screenshot" instead.');
  }
  /* preferCurrentTab is Chromium-only and is a HINT: it puts this tab at the
     top of the chooser. Elsewhere the reader picks, which is correct -- their
     screen, their choice. */
  const stream = await media.getDisplayMedia({
    video: { frameRate: 1 },
    audio: false,
    preferCurrentTab: true,
    selfBrowserSurface: 'include'
  });
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('No screen frame arrived within 10 seconds.')),
        FRAME_TIMEOUT_MS
      );
      /* requestVideoFrameCallback fires on a frame that has actually been
         composited. readyState alone can be satisfied by a track that has
         produced metadata and no picture. */
      if (typeof video.requestVideoFrameCallback === 'function') {
        video.requestVideoFrameCallback(() => { clearTimeout(timer); resolve(); });
      } else {
        const poll = setInterval(() => {
          if (video.videoWidth > 0 && video.readyState >= 2) {
            clearInterval(poll);
            clearTimeout(timer);
            resolve();
          }
        }, 60);
      }
    });
    const frame = pixelsFromSource(video, video.videoWidth, video.videoHeight);
    video.pause();
    video.srcObject = null;
    return { ...frame, method: 'display' };
  } finally {
    stopTracks(stream);
  }
}

/**
 * @param {object} [options]
 * @param {function} [options.capture] host-supplied capture returning a Blob,
 *        an ImageBitmap, or {width,height,rgba}. Used by the proof harness.
 * @returns {Promise<{width:number,height:number,rgba:Uint8ClampedArray,method:string}>}
 */
export async function screenFrame({ capture } = {}) {
  if (typeof capture === 'function') {
    const supplied = await capture();
    if (supplied && supplied.rgba && supplied.width && supplied.height) {
      return { ...supplied, method: supplied.method || 'host' };
    }
    if (supplied && typeof createImageBitmap === 'function') {
      /* colorSpaceConversion:'none' matters: the browser's image decoder will
         otherwise shift sample values by a level or two on a tagged image, and
         a print engine that claims to preserve pixels must not quietly alter
         them. Codex measured exactly this in WebKit on 2026-09-05. */
      const bitmap = await createImageBitmap(supplied, {
        colorSpaceConversion: 'none',
        premultiplyAlpha: 'none'
      });
      try {
        return { ...pixelsFromSource(bitmap, bitmap.width, bitmap.height), method: 'host' };
      } finally {
        bitmap.close();
      }
    }
    throw new Error('The supplied capture produced nothing usable.');
  }
  return fromDisplay();
}
