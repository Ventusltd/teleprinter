# Teleprinter

**Emit the record exactly as it was.**

A teleprinter did not summarise, reflow or improve the message. It printed what
came down the wire. This does the same for a screen: it takes what the reader is
actually looking at and writes it out as a file, at the resolution they are
looking at it, in the shape they are looking at it.

No paper. No page sizes. No reflow. No clever processing.

```js
import { teleprint } from './teleprinter.js';

await teleprint();                       // capture the screen, save a 1:1 PDF
await teleprint({ format: 'png' });      // the same frame, as an image
```

---

## Why this exists

It was written on 2026-09-05 after three wrong answers in a row inside a mapping
application, each of which failed for the same underlying reason: they treated
"print" as a paper problem.

1. **Letterboxed.** The map was fitted into the middle of a sheet with white
   bands above and below. `object-fit: contain` on an `@page` with an 8 mm
   margin.
2. **A completely white page.** The fix hid every element except a captured
   raster — but that raster only existed if the application's own Print button
   had run. A reader who pressed Ctrl+P, or used the browser's menu, got a blank
   sheet. Reported as: *"it didnt work printed white FUCKING SCREENS"*.
3. **A reduced copy.** The next version wrote a PDF, but scaled the long edge to
   1190 pt — "A3-ish" — so a 1390 × 518 capture came out as a 1190 × 443 page. A
   14 % reduction of the record, for no reason other than an assumption about
   paper that nobody had asked for.

Underneath all three: the browser print pipeline is not ours. It differs per
browser, it involves a dialog, a destination and a driver, and on the machine
this was written for it produced **no file at all** when a physical printer was
selected. Anything built on it inherits that.

So this does not use it.

---

## What it actually does

### Path A — display capture (the real screengrab)

`navigator.mediaDevices.getDisplayMedia()`. The reader picks the tab or window,
the browser hands back a live video track of it, and one frame is taken. That
frame is the compositor's own output: every layer, every overlay, WebGL and DOM
alike, at the device's real resolution. There is nothing to get wrong, because
nothing is being reconstructed.

This is the default, and it is the only path that can honestly be called a
screen grab.

- Chrome, Edge, Firefox, Safari on macOS: supported.
- **iOS Safari: not supported at all.** `getDisplayMedia` does not exist there.
- Requires a user gesture, and the reader chooses what is shared.

### Path B — compose (fallback)

When display capture is unavailable or declined, the engine composes the frame
itself: it draws every `<canvas>` on the page at its backing-store resolution,
then rasterises the DOM above it through an SVG `<foreignObject>`.

**This path is a reconstruction, and it is labelled as one** in the returned
metadata (`method: 'compose'`) and in the file's own footer. It is close, not
identical. Cross-origin images are dropped by the browser's own security rules,
and a few CSS features do not survive `foreignObject`.

If you need certainty, use Path A.

---

## Orientation and shape

There is no orientation setting, because there is nothing to decide. The output
is the shape of what was captured:

| the reader is on | the record is |
|---|---|
| a phone held upright, 393 × 852 | 393 × 852 — portrait |
| a phone turned sideways, 852 × 393 | 852 × 393 — landscape |
| a 2560 × 1440 monitor | 2560 × 1440 — landscape |

Portrait and landscape are observations, not options. A PDF page is one unit per
captured pixel, so a viewer at 100 % shows the reader's own pixels, and nothing
is resampled on the way out.

---

## The PDF

Written here, in about 90 lines, with no dependency.

The frame is encoded as JPEG and embedded with `/DCTDecode`, which PDF reads
natively — so the browser's own encoder output goes in verbatim and there is no
compressor in this repository. Set `quality: 1` for lossless-ish, or
`format: 'png'` if you would rather have the image on its own.

Every record carries its provenance in the footer: the page title, the URL it
was taken from, the UTC timestamp, the pixel dimensions, and which of the two
paths produced it. A record you cannot trace is not evidence.

---

## Files

```
teleprinter.js   the engine - capture, compose, emit
pdf.js           a minimal single-image PDF writer, no dependencies
demo.html        open it, press the button, inspect what comes out
test/            outcome tests: a real download, decoded and measured
```

## Limits, stated plainly

- **iOS Safari cannot do Path A.** It has no `getDisplayMedia`. On an iPhone you
  get Path B, and it is a reconstruction.
- **Path A needs a user gesture and a permission prompt.** It cannot be run
  silently, by design, and that is correct.
- **Path B cannot capture cross-origin images** or anything the browser refuses
  to taint a canvas with. It does not pretend otherwise: it reports what it
  dropped.
- **Neither path captures browser chrome** — the address bar, the tabs. Only the
  page.
- This has been exercised in Chromium, Firefox and WebKit under Playwright, and
  on a real Chrome and a real Firefox by hand. It has **not** been exercised on
  a physical iPhone.
