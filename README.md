# Teleprinter

**Emit the record exactly as it was.**

*Teleprint*, because it is printed on a **telephone**. The reader is standing
somewhere with a phone in their hand, and what is on that screen has to come off
it as a file they can send, attach or keep. The name is from the teleprinters,
which printed what came down the wire and did not improve it.

That is the whole design rule, and it is why this repository refuses so much: no
paper, no page sizes, no reflow, no summarising, no clever processing.

## What this is part of, and what it is emphatically not

This belongs to an open, public layer for the power grid — **the Linux of the
power grid**, in the sense that the map and the working are public rather than
locked inside one organisation.

**That layer describes what talks to what: the connections between substations
and power plants.** Where a project is, which substation is near it, at what
voltage class, how far, and what the published record says. Network-level facts,
of the kind a planner, a journalist, a landowner or a developer has a legitimate
reason to see.

**It does not expose the internal workings, and it must not pretend to.**
Protection schemes, switchgear internals, fault studies, earthing, stability,
constructability, connection design — those are specialised skills far beyond
any AI agent, and they belong to engineers with deep applied electrical
experience. Nothing printed from here is a connection offer, a constructability
assessment or a consenting design, and no output of this tooling should ever be
read as engineering. It is a public record of a public map.

That boundary is the reason the record has to be exact. An engineer who is
handed a screengrab and the source that produced it can see precisely what was
claimed and on what basis, and can say it is wrong. A summary cannot be
challenged that way.

## Why it matters more than a print button

A screen you cannot get off your phone is a screen only its owner can act on. If
a reader can teleprint what they are looking at, and teleprint the code that
produced it, then the working and the reasoning both leave the building: they
can be attached to a message, handed to a regulator, put in front of an AI that
will argue with them, or kept as a dated record of what a system claimed on a
given afternoon.

Two buttons, and neither asks the reader to know anything:

| button | what the reader gets |
|---|---|
| **Print** | what is on the screen right now, as a PDF at 1:1 |
| **Print source code** | the code behind it, as a `.txt` they can attach in ChatGPT on the same phone |

```js
import { mount } from './index.js';
mount();                                 // both buttons, thumb-sized, phone-first

import { teleprint, printSourceCode } from './index.js';
await teleprint();                       // capture the screen, save a 1:1 PDF
await teleprint({ format: 'png' });      // the same frame, as an image
await printSourceCode();                 // the running source, as plain text
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
index.js         the one entry point: mount(), and both engines re-exported
teleprinter.js   Print - capture the screen, compose if it must, emit
source.js        Print source code - the running source as attachable plain text
pdf.js           a minimal single-image PDF writer, no dependencies
demo.html        open it, press the button, inspect what comes out
test/            outcome tests: a real download, decoded and measured
```

An application does not have to use `mount()`. Anything satisfying these two
shapes can be swapped in for either engine - that is the entire contract:

```
teleprint()        -> {method,width,height,orientation,bytes,filename,blob}
printSourceCode()  -> {text,filename,files,bytes,missing,commit}
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

## Codex driver and Test Code integration — 2026-09-05

The separate Codex-authored implementation is in [drivers/codex](drivers/codex/README.md).
Its controls say **Print**, **Print source code**, **Copy source code**, and,
where supported, **Share source code**. The source print is a UTF-8 text file
with its repository, exact commit, selected files and byte hashes. Readers can
attach it in ChatGPT or copy its contents without using GitHub or knowing code.

This driver does not use the reconstruction fallback described above. It prints
a captured screen or a user-selected screenshot, preserving supported PNG sample
bytes and ICC profiles in the PDF. If self-capture is unavailable, the reader
can choose a device screenshot. Physical iPhone and native share-sheet validation
remain separate from desktop browser emulation.

`drivers/codex/outcome-results.json` records 16 browser/viewport combinations
(Chrome, Edge, Firefox, WebKit; portrait and landscape) with actual PDF and text
downloads, uploaded-screenshot checks and complete manual-copy fallbacks.
`drivers/codex/app-outcomes.json` records nine additional Pipeline/Atlas/Test Code
checks in Chrome, Firefox and mobile WebKit emulation. Screenshots and test PDFs
are not retained. The integration is Test Code generation **202609051419**;
source scopes and external-dependency exclusions are included in its text files.
