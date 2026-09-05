/* WIRING: put the two functions in the File menu, and nowhere else.
   --------------------------------------------------------------------------
   The reader already knows where printing lives -- they found it once and
   printed a sheet from it. A floating button somewhere else would be a second
   place to learn, so both controls go into the same EXPORT THIS VIEW group,
   next to the print command that is already there.

   The two are SEPARATE COMMANDS and are never merged into one "export":
     Print PDF          a picture of the screen, for a person to look at
     Print source code  the whole source and its dependencies, for a machine
                        to read

   NOTHING EXISTING IS REPLACED. The older map-only PDF control stays exactly
   as it is. Two implementations of the same idea sitting side by side is the
   point -- where they disagree, the disagreement is the finding. */

var PANEL_ANCHOR = '#gridatlas-export-print';
var STATUS_ID = 'gridatlas-teleprint-status';
var MAX_TRIES = 80;

function statusLine(anchor) {
  var node = document.getElementById(STATUS_ID);
  if (node) return node;
  node = document.createElement('div');
  node.id = STATUS_ID;
  node.setAttribute('role', 'status');
  node.setAttribute('aria-live', 'polite');
  node.style.cssText = 'padding:6px 11px;font:10px/1.4 ui-monospace,'
    + 'SFMono-Regular,Menlo,monospace;color:#9fd6e4;opacity:.9;'
    + 'white-space:normal;max-width:34ch';
  if (anchor && anchor.parentNode) anchor.parentNode.appendChild(node);
  return node;
}

function say(text) {
  var node = document.getElementById(STATUS_ID);
  if (node) node.textContent = text;
}

/* The teleprint of the source is prepared when the FILE MENU OPENS, not when
   the button is pressed.

   Collecting it means reading every resource the browser loaded, which takes
   seconds and ends the user gesture. A share sheet or a clipboard write
   requested after that gesture has ended is refused, and the reader is told
   nothing happened for no reason they can see. Preparing early costs one
   speculative pass and makes the press instant. */
var prepared = null;
var preparing = null;

function beginPreparing() {
  if (prepared || preparing) return preparing;
  preparing = collectSourceCode({ appName: 'GridAtlas' })
    .then(function (result) {
      prepared = result;
      preparing = null;
      say('Source ready · ' + result.included + ' files'
        + (result.missing.length ? ' · ' + result.missing.length + ' not readable' : ''));
      return result;
    })
    .catch(function (error) {
      preparing = null;
      say('Source could not be prepared: ' + (error && error.message));
      throw error;
    });
  return preparing;
}

function button(label, id, onClick) {
  var node = document.createElement('button');
  node.id = id;
  node.setAttribute('type', 'button');
  node.setAttribute('data-gm-export', id.replace('gridatlas-', ''));
  node.setAttribute('data-teleprint', '1');
  node.textContent = label;
  node.addEventListener('click', function () { onClick(node); });
  return node;
}

function install() {
  var anchor = document.querySelector(PANEL_ANCHOR);
  if (!anchor || !anchor.parentNode) return false;
  if (document.getElementById('gridatlas-teleprint-source')) return true;

  var pdf = button('⎙ Print PDF · exactly this screen',
    'gridatlas-teleprint-pdf', function (node) {
      var was = node.textContent;
      say('Capturing the screen…');
      printPdf({
        note: {
          brand: 'VENTUS · GLOBALGRID2050 · GRID ATLAS',
          title: document.title,
          url: location.href,
          stamp: new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
          credit: Array.prototype.map.call(
            document.querySelectorAll('.maplibregl-ctrl-attrib-inner'),
            function (n) { return n.textContent.trim(); }
          ).filter(Boolean).join(' | ')
        }
      }).then(function (receipt) {
        say('PDF · ' + receipt.width + '×' + receipt.height
          + ' px, 1:1, page ' + receipt.pageWidth + '×' + receipt.pageHeight
          + ' · via ' + receipt.method);
        node.textContent = was;
      }, function (error) {
        /* The reader cancelling the screen-share chooser is a decision, not a
           fault, and must not be reported as one. */
        say(error && /denied|Permission|abort/i.test(String(error.message || error))
          ? 'Screen capture was not allowed, so nothing was printed.'
          : 'Could not print: ' + (error && error.message));
        node.textContent = was;
      });
    });

  var source = button('⎙ Print source code · for AI review',
    'gridatlas-teleprint-source', function () {
      say('Preparing the source…');
      Promise.resolve(prepared || beginPreparing()).then(function (collected) {
        return deliverSourceCode(collected, { panel: true });
      }).then(function (receipt) {
        say('Source code · ' + receipt.included + ' files, '
          + receipt.bytes + ' bytes · ' + receipt.via.join(' + ')
          + (receipt.missing ? ' · ' + receipt.missing + ' not readable' : ''));
      }, function (error) {
        say('Could not print the source: ' + (error && error.message));
      });
    });

  anchor.parentNode.insertBefore(pdf, anchor.nextSibling);
  pdf.parentNode.insertBefore(source, pdf.nextSibling);
  statusLine(source);
  say('Print PDF saves this screen. Print source code saves the code behind it.');

  /* Opening File is the signal to start work. Delegated from the document so
     it survives the menu being rebuilt. */
  document.addEventListener('click', function (event) {
    var title = event.target && event.target.closest
      ? event.target.closest('.gm-title') : null;
    if (title && /file/i.test(title.textContent || '')) beginPreparing();
  }, true);
  return true;
}

/* The export group is built by the menu bar, which itself installs only once
   63 layer controls exist. Polling rather than assuming: a fixed delay is a
   guess that is wrong on a slow phone and wasteful on a fast desktop. */
if (!install()) {
  var tries = 0;
  var timer = setInterval(function () {
    tries += 1;
    if (install() || tries >= MAX_TRIES) clearInterval(timer);
  }, 250);
}
