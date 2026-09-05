import { screenPdf } from './screen-pdf.mjs';

export function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function imagePixels(blob) {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('This image could not be read. Choose a PNG screenshot.'));
      image.src = url;
    });
    const width = image.naturalWidth, height = image.naturalHeight;
    if (!width || !height || width * height > 40000000) throw new Error('The screenshot is empty or too large.');
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    return { width, height, rgba: ctx.getImageData(0, 0, width, height).data };
  } finally { URL.revokeObjectURL(url); }
}

async function displayPixels() {
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('This browser cannot capture its own screen. Take a screenshot on your device, then choose Print a screenshot.');
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false, preferCurrentTab: true });
  const video = document.createElement('video');
  try {
    video.muted = true; video.playsInline = true; video.srcObject = stream;
    await video.play();
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('No screen frame arrived. Try Print again.')), 10000);
      const ready = () => { clearTimeout(timeout); resolve(); };
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(ready);
      else requestAnimationFrame(() => requestAnimationFrame(ready));
    });
    const width = video.videoWidth, height = video.videoHeight;
    if (!width || !height || width * height > 40000000) throw new Error('The shared screen has no usable image.');
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0);
    return { width, height, rgba: ctx.getImageData(0, 0, width, height).data };
  } finally {
    stream.getTracks().forEach(track => track.stop());
    video.pause(); video.srcObject = null;
  }
}

/** A host provider must return an actual browser screenshot; no DOM reconstruction. */
export async function printScreen({ capture, image, filename = 'teleprint-screen.pdf' } = {}) {
  let frame, method;
  if (image) { frame = await imagePixels(image); method = 'device-screenshot'; }
  else if (capture) { frame = await imagePixels(await capture()); method = 'browser-screenshot'; }
  else { frame = await displayPixels(); method = 'display-capture'; }
  const data = await screenPdf(frame);
  const blob = new Blob([data], { type: 'application/pdf' });
  downloadFile(blob, filename);
  return { method, width: frame.width, height: frame.height, bytes: data.length, filename, status: 'download-requested' };
}
