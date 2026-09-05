# Print source code

This Codex-authored driver creates a plain UTF-8 `.txt` file for reviewing version-pinned GitHub source in an AI chatbot. It is independent of screen/PDF printing and never calls `window.print()`.

The Node builder reads committed Git objects using an explicitly supplied revision, resolves it once to a full commit SHA, and includes the GitHub repository identity, commit, tree, literal scopes, and full selected inventory. Dirty and untracked working-tree files never substitute for committed content. No timestamps are added, so the same input produces identical bytes.

Every included file has its repository-relative path, Git blob object ID, SHA256, original byte count, and zero-based byte offset in the bundle. BEGIN/END markers provide readable boundaries; byte offsets and lengths remain authoritative if source text itself contains marker-like text. BOM, CRLF, Unicode, empty files, and missing final newlines are preserved. The manifest also contains the entire bundle's SHA256 and byte count.

All selected valid UTF-8 regular-file and symlink-target blobs are included, including dotfiles and generated files. Blobs containing NUL, invalid UTF-8 blobs, and submodules are explicitly omitted with reasons. Submodule contents are not recursively fetched. Git LFS pointer files remain their actual committed pointer text. Missing scopes/revisions, unsafe scope paths, and zero included text files fail. There is no truncation; a Git operation exceeding the 256 MiB capture limit fails instead. The repository must already exist locally; fetching/cloning is the caller's responsibility.

```js
import {
  createSourceCodeBundle,
  writeSourceCodeBundle,
  verifySourceCodeBundle,
  verifySourceCodeBundleAgainstRepository,
} from './source-code.mjs';

const options = {
  repoDir: '/path/to/repository',
  revision: 'FULL_COMMIT_SHA',
  paths: ['src', 'README.md'], // literal repository-relative files/directories; default ['.']
  // repository: 'https://github.com/owner/repo', // defaults to origin remote
};
const { text, manifest } = await createSourceCodeBundle(options);
verifySourceCodeBundle(text, manifest, { expectedCommit: options.revision });
await verifySourceCodeBundleAgainstRepository(text, manifest, {
  repoDir: options.repoDir,
  expectedCommit: options.revision,
  paths: options.paths,
});
await writeSourceCodeBundle({
  ...options,
  textPath: '/site/source-code.txt',
  manifestPath: '/site/source-code.manifest.json',
});
```

CLI: `node drivers/codex/source-code.mjs REPO_DIR REVISION TEXT_PATH MANIFEST_PATH [SCOPE ...]`.

Host the text and manifest on the app's own HTTP(S) origin. Attach the browser module to the user-facing button:

```js
import { attachPrintSourceCode } from './drivers/codex/print-source-code.js';
const detach = attachPrintSourceCode({
  button: document.querySelector('#print-source-code'),
  copyButton: document.querySelector('#copy-source-code'), // optional
  shareButton: document.querySelector('#share-source-code'), // optional; hidden if unsupported
  status: document.querySelector('#source-status'), // optional; an accessible live status is created otherwise
  fallbackContainer: document.querySelector('#source-fallback'), // optional
  textUrl: '/source-code.txt',
  manifestUrl: '/source-code.manifest.json',
  expectedRepository: 'https://github.com/owner/repo',
  expectedCommit: 'FULL_COMMIT_SHA',
  filename: 'project-source-code.txt',
  onError: error => { document.querySelector('#status').textContent = error.message; },
});
```

The button says **Print source code**. Both files are fetched with caching disabled during setup, rejecting redirects/cross-origin URLs. Controls remain disabled until bundle and per-file SHA256, byte boundaries, and inventory counts have passed. Clipboard and native sharing are then invoked directly in the click's user gesture, without preceding network/hash awaits, to retain mobile browser activation. `detach.ready` resolves to `{ bytes, manifest }` when ready, or `null` after a preparation error. No download is started before a click.

**Print source code** downloads the original UTF-8 bytes and reports “Text file download requested.” **Copy source code** copies the complete text and reports success only after the clipboard promise resolves; if clipboard access fails, a visible, labeled, read-only text area exposes the entire text for manual select-all/copy. **Share source code** invokes native file sharing only when supported for the actual file. Nothing claims a ChatGPT attachment was sent. Guidance reads: “Attach this text file in ChatGPT, or copy and paste its contents.”

Errors trigger `sourcecodeerror` on the relevant button and the optional `onError` callback. `fetchVerifiedSourceCode(options)` is also available for integrations and returns `{ bytes, manifest }` without downloading. `attachSourceCodeControls` is an alias of `attachPrintSourceCode`. The desktop tests do not establish physical iPhone behavior.

SHA256 verifies consistency, not a cryptographic signature or repository ownership. Supply trusted expected repository/commit values in the integration. Repository-backed verification additionally regenerates the selected committed inventory; supply the expected scopes to detect a self-consistent but incomplete bundle. Deploy the text and manifest together to avoid version mismatch.

Run deterministic temporary-Git-repository tests with `node --test drivers/codex/source-code.test.mjs`. Tests cover byte preservation, dirty/untracked exclusion, binary omissions, pinned revision, scope failure/traversal protection, changed bytes, missing files, wrong revisions, and output round-trip.
