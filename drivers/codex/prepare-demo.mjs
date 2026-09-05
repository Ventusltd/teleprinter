import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeSourceCodeBundle} from './source-code.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const repoDir=path.resolve(here,'../..');
const names=['controls.js','print-screen.js','screen-pdf.mjs','png-pixels.mjs','print-source-code.js','source-code.mjs','driver.mjs','README.md','SOURCE-CODE.md','demo.html'];
const result=await writeSourceCodeBundle({repoDir,revision:process.argv[2]||'HEAD',paths:names.map(name=>'drivers/codex/'+name),textPath:path.join(here,'source-code.txt'),manifestPath:path.join(here,'source-code.manifest.json')});
console.log('Prepared the committed Teleprinter source for demo.html.');
