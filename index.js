/**
 * TELEPRINT — the one entry point.
 *
 * "teleprint" because it is printed on a telephone. The reader is standing
 * somewhere with a phone in their hand, and the thing they are looking at has
 * to come off the screen as a file they can send, attach or keep. The name is
 * from the teleprinters, which printed what came down the wire and did not
 * improve it.
 *
 * Two buttons, and neither of them asks the reader to know anything:
 *
 *   Print              what is on the screen, right now, as a PDF at 1:1
 *   Print source code  the code behind it, as a .txt they can attach in
 *                      ChatGPT on the same phone
 *
 * mount() puts both on the page, sized for a thumb, and returns handles so an
 * application can drive them itself instead. Any engine that satisfies these
 * two shapes can be swapped in — that is the whole contract:
 *
 *   teleprint()        -> {method,width,height,orientation,bytes,filename,blob}
 *   printSourceCode()  -> {text,filename,files,bytes,missing,commit}
 */
import { teleprint, canDisplayCapture } from './teleprinter.js';
import { printSourceCode } from './source.js';

export { teleprint, printSourceCode, canDisplayCapture };

const STYLE = `
.teleprint-bar{position:fixed;z-index:2147483000;display:flex;gap:8px;
  right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));
  font:14px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace}
.teleprint-bar button{min-height:48px;min-width:48px;padding:12px 16px;
  cursor:pointer;color:#bdfaff;background:#0f2833e6;border:1px solid #37656b;
  border-radius:2px;font:inherit;-webkit-tap-highlight-color:transparent}
.teleprint-bar button:active{background:#164152}
.teleprint-bar button[disabled]{opacity:.6;cursor:progress}
@media (max-width:520px){
  .teleprint-bar{left:12px;right:12px;justify-content:stretch}
  .teleprint-bar button{flex:1}
}
@media print{.teleprint-bar{display:none!important}}
`;

/**
 * @param {object} [options]
 * @param {Element} [options.container=document.body]
 * @param {string[]} [options.files]         passed to printSourceCode
 * @param {string} [options.appName]
 * @param {(result:object)=>void} [options.onDone]
 * @param {(error:Error)=>void} [options.onError]
 * @returns {{print:Function,printSource:Function,element:HTMLElement,destroy:Function}}
 */
export function mount(options = {}) {
  const {
    container = document.body, files = null, appName = null,
    onDone = null, onError = null
  } = options;

  if (!document.getElementById('teleprint-style')) {
    const style = document.createElement('style');
    style.id = 'teleprint-style';
    style.textContent = STYLE;
    document.head.appendChild(style);
  }

  const bar = document.createElement('div');
  bar.className = 'teleprint-bar';
  /* Excluded from its own capture: a control that photographs itself is not
     the record the reader was looking at. The compose path skips it by id,
     and the display path never sees it because the bar is hidden for the
     frame that is taken. */
  bar.id = 'teleprint-bar';

  const button = (label, run) => {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    element.addEventListener('click', async () => {
      const was = element.textContent;
      element.disabled = true;
      element.textContent = '…';
      /* Hidden for the duration so the bar cannot appear in the record. */
      bar.style.visibility = 'hidden';
      try {
        const result = await run();
        element.textContent = '✓';
        if (onDone) onDone(result);
      } catch (error) {
        element.textContent = '⊘';
        if (onError) onError(error);
        else console.error('[teleprint]', error);
      } finally {
        bar.style.visibility = '';
        setTimeout(() => { element.textContent = was; element.disabled = false; }, 2200);
      }
    });
    bar.appendChild(element);
    return element;
  };

  const printButton = button('Print', () => teleprint({}));
  const sourceButton = button('Print source code',
    () => printSourceCode({ files, appName: appName || document.title }));

  container.appendChild(bar);

  return {
    element: bar,
    print: (o) => teleprint(o || {}),
    printSource: (o) => printSourceCode(Object.assign({ files, appName }, o || {})),
    destroy: () => { bar.remove(); }
  };
}

export default { teleprint, printSourceCode, canDisplayCapture, mount };
