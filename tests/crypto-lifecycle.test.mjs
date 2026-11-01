import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

test('logout invalidates a pending vault fetch before it can restore a session',async t=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'window');
  Object.defineProperty(globalThis,'window',{configurable:true,value:{isSecureContext:true}});
  t.after(()=>previous?Object.defineProperty(globalThis,'window',previous):delete globalThis.window);
  const require=createRequire(new URL('../phase-one/package.json',import.meta.url));
  const library=new URL('./openpgp.mjs',pathToFileURL(require.resolve('openpgp'))).href;
  const source=readFileSync(new URL('../phase-one/public/crypto.js',import.meta.url),'utf8').replace("'/vendor/openpgp.min.mjs'",JSON.stringify(library));
  const crypto=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#lifecycle`);
  let resume;const pending=crypto.openSession({id:'old-user'},()=>new Promise(resolve=>resume=resolve));
  const rejection=assert.rejects(pending,/keys_locked/);
  await crypto.closeSession('old-user').catch(()=>{});
  resume({vault:{fingerprint:'old-fingerprint'},serverTime:Date.now()});
  await rejection;assert.equal(crypto.unlocked(),false);assert.throws(()=>crypto.ownIdentity(),/keys_required/);
});
