import test from 'node:test';
import assert from 'node:assert/strict';
import { captureAppFrame } from './app-frame.js';
test('oversized app views refuse before any capture or sharing',async t=>{
 const names=['document','innerWidth','innerHeight','devicePixelRatio'];const saved=Object.fromEntries(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]));t.after(()=>names.forEach(n=>saved[n]?Object.defineProperty(globalThis,n,saved[n]):delete globalThis[n]));
 for(const [n,v] of Object.entries({document:{fonts:{ready:Promise.resolve()}},innerWidth:20000,innerHeight:20000,devicePixelRatio:2}))Object.defineProperty(globalThis,n,{configurable:true,value:v});
 await assert.rejects(captureAppFrame(),/too large/);
});
