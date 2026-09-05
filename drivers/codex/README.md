# Codex Teleprinter driver

**Print** saves the visible screen as a digital PDF. **Print source code** creates
a complete text file for the selected app version. A reader can attach that file
in ChatGPT, use **Copy source code**, or use **Share source code** where the phone
supports sharing files. No GitHub login or coding knowledge is needed by readers.

This directory is the separate Codex-authored implementation. Claude's root
`teleprinter.js`, `pdf.js`, and source engine are independent implementations.

## Screen pixels

`screen-pdf.mjs` embeds losslessly compressed RGB pixels (and an alpha mask when
required), with no drawn footer, margins, JPEG encoding, reflow, or scaling.
The PDF page uses one point per captured pixel. That is a digital page convention,
not a promise that every PDF viewer's 100% zoom equals the device's CSS pixels.

`png-pixels.mjs` decodes RGB/RGBA 8-bit PNG screenshots without the browser image
decoder changing their colour values. Embedded ICC profiles travel into the PDF
unchanged. Other valid image formats use the browser's image decoder. Uploaded
PNG modes outside this decoder's supported set may undergo browser colour conversion.

`print-screen.js` captures a frame through the browser's screen-sharing chooser.
It keeps the resolution the browser supplies; the browser/OS may itself limit
capture resolution. Declined or unavailable capture is an explicit failure. It
does not substitute a reconstructed DOM image. **Print a screenshot** accepts a
device screenshot at its existing dimensions when self-capture is unavailable.
Screenshots already compressed as JPEG cannot recover their lost detail.
All display tracks stop after capture, including error paths.

`driver.mjs` attaches an in-memory Playwright screenshot provider. Its capture is
the current viewport including selected layers, WebGL, and DOM. It never writes
a screenshot file. The PDF method/dimensions are in the returned receipt, outside
the image, so provenance does not alter what the user saw.

## App integration

Serve this directory's browser modules with the app. Call `mountTeleprinter`
from `controls.js`, passing `manifestUrl`, `textUrl`, `expectedCommit`,
`expectedRepository`, and `appName`. Source bytes are prepared when the reader
opens Teleprinter, preserving the later click gesture for iPhone sharing/copying.
Only the integration configuration and committed runtime copies belong in the
app; engine development belongs here.

See [SOURCE-CODE.md](SOURCE-CODE.md) for the Git builder and exact inventory.
Runtime imports, third-party services, datasets and unselected repository files
are not magically included: the selected scope and omissions are recorded.
There is no promise that an AI app will accept an arbitrarily large attachment.
Nothing is silently shortened to fit.

## Measured tests

Run `node --test drivers/codex/source-code.test.mjs` and
`node drivers/codex/outcome.test.mjs`. The latter needs Playwright (or its absolute
`index.mjs` path in `PLAYWRIGHT_MODULE`) and Python `pypdf`, `pymupdf`, `Pillow`.

`outcome-results.json` records Chrome, Edge, Firefox and WebKit, each at desktop
portrait/landscape and mobile portrait/landscape with device pixel ratio 2.
Tests select a WebGL layer, click the real Print control, read the actual browser
download, decode its image, render its PDF and compare every RGB pixel to the
captured screen. Source downloads and manual-copy text are compared byte-for-byte.
For screenshots carrying an ICC profile, raw RGB and the profile are compared
exactly, then PDF rendering is compared with colour-managed PNG rendering. The
actual Pipeline and Atlas checks caught a one-level colour change in WebKit's
browser image decoder that the simpler fixture did not expose.
Missing controls and corrupt source bundles must fail without an unhandled
download rejection. Downloads are deleted and images remain in memory.

These are automated browser tests, not physical Android/iPhone tests. The screen
sharing chooser and native mobile share sheet require separate device validation.
