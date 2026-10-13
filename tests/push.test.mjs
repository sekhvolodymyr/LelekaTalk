import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createECDH, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import http from 'node:http';
import { createCloudApp } from '../src/cloud-app.mjs';
import { emptyDatabase } from '../src/postgres-store.mjs';
import { createPushService, validSubscription, queueMessagePush } from '../phase-one/src/push-service.mjs';
const require = createRequire(new URL('../phase-one/package.json', import.meta.url));
const pgp = require('openpgp'), webpush = require('web-push');
const vapid = webpush.generateVAPIDKeys();
const pair = await pgp.generateKey({ type: 'ecc', curve: 'curve25519', userIDs: [{ name: 'Push fixture' }] });
const ciphertext = await pgp.encrypt({ message: await pgp.createMessage({ text: 'secret test content' }), encryptionKeys: await pgp.readKey({ armoredKey: pair.publicKey }) });
function subscription(suffix = randomUUID()) { const ecdh = createECDH('prime256v1');ecdh.generateKeys();return { endpoint: `https://fcm.googleapis.com/fcm/send/${suffix}`, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } }; }
function memoryStore(database, failMessages = false) {
  let state = structuredClone(database), tail = Promise.resolve();
  return { snapshot: () => structuredClone(state), run(mutating, action) {
    const next = tail.then(async () => { const copy = structuredClone(state); const result = await action(copy); if(mutating) { if(failMessages && copy.mvp.messages.length)throw Error('failed commit');state = copy; } return result; });tail=next.catch(()=>{});return next;
  } };
}
async function fixture(t, failMessages = false) {
  const database = emptyDatabase();
  const actors = ['alice','bob','outsider'].map((name,index)=>({id:randomUUID(),username:name,personalName:name,crypto:{publicKey:pair.publicKey},token:String(index+1).repeat(64)}));
  database.users = actors;
  database.sessions = actors.map(a=>({userId:a.id,tokenHash:createHash('sha256').update(a.token).digest('hex'),expiresAt:Date.now()+60_000}));
  const chat = {id:randomUUID(),type:'direct',ownerId:actors[0].id,revision:1,members:actors.slice(0,2).map(a=>({userId:a.id,status:'accepted'}))};database.mvp.chats.push(chat);
  const store = memoryStore(database,failMessages), delivered=[];
  const pushService=createPushService({...vapid,send:async (target,payload)=>{assert.equal(store.snapshot().mvp.messages.length,1,'push requires durable message');delivered.push({target,payload:JSON.parse(payload)});}});
  const app=createCloudApp({store,allowedOrigins:['https://lelekatalk.example'],pushService});app.listen(0,'127.0.0.1');await once(app,'listening');
  t.after(async()=>{app.close();app.closeAllConnections();await once(app,'close');});
  async function call(actor,path,method='GET',body) {const encoded=body?JSON.stringify(body):undefined;return new Promise((resolve,reject)=>{const req=http.request(`http://127.0.0.1:${app.address().port}/api/${path}`,{method,headers:{Host:'lelekatalk.example',Origin:'https://lelekatalk.example',...(actor?{Cookie:`leleka_session=${actor.token}`} : {}),...(encoded?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(encoded)}:{})}},res=>{const parts=[];res.on('data',x=>parts.push(x));res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(Buffer.concat(parts).toString())}));});req.on('error',reject);req.end(encoded);});}
  return { actors,chat,store,delivered,call };
}
async function waitFor(check) {for(let i=0;i<100;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,10));}assert.ok(check());}

test('push subscriptions require auth, validate providers, enforce ownership and disappear on logout',async t=>{
  const f=await fixture(t),[alice,bob]=f.actors,value=subscription();
  assert.equal((await f.call(null,'mvp/push')).status,401);
  assert.equal((await f.call(alice,'mvp/push','POST',{subscription:{...value,endpoint:'https://127.0.0.1/private'}})).status,400);
  assert.equal((await f.call(alice,'mvp/push','POST',{subscription:value})).status,201);
  assert.equal((await f.call(bob,'mvp/push','POST',{subscription:value})).status,409);
  await f.call(bob,'mvp/push','DELETE',{endpoint:value.endpoint});assert.equal(f.store.snapshot().pushSubscriptions.length,1);
  assert.deepEqual((await f.call(bob,'mvp/push')).data.endpoints,[]);
  await f.call(alice,'logout','POST');assert.equal(f.store.snapshot().pushSubscriptions.length,0);
});
test('new messages notify only accepted recipients, after commit, without plaintext; retries do not enqueue duplicates',async t=>{
  const f=await fixture(t),[alice,bob,outsider]=f.actors;
  for(const actor of f.actors)await f.call(actor,'mvp/push','POST',{subscription:subscription(actor.username)});
  const body={id:randomUUID(),ciphertext,revision:1};
  assert.equal((await f.call(alice,`mvp/chats/${f.chat.id}/messages`,'POST',body)).status,201);
  await waitFor(()=>f.delivered.length===1);
  assert.equal(f.delivered[0].payload.userId,bob.id);assert.equal(f.delivered[0].payload.chatId,f.chat.id);
  assert.ok(!JSON.stringify(f.delivered).includes('secret test content'));
  await f.call(alice,`mvp/chats/${f.chat.id}/messages`,'POST',body);
  assert.equal(f.delivered.length,1);assert.notEqual(f.delivered[0].payload.userId,outsider.id);
});
test('a failed message commit cannot emit a push',async t=>{
  const f=await fixture(t,true),[alice,bob]=f.actors;
  await f.call(bob,'mvp/push','POST',{subscription:subscription()});
  assert.equal((await f.call(alice,`mvp/chats/${f.chat.id}/messages`,'POST',{id:randomUUID(),ciphertext,revision:1})).status,503);
  assert.equal(f.delivered.length,0);assert.equal(f.store.snapshot().mvp.messages.length,0);
});
test('outbox leases avoid duplicate sends, expired subscriptions are removed, transient failures wait for retry',async()=>{
  for(const statusCode of [201,410,503]){
    const d=emptyDatabase(),senderId=randomUUID(),userId=randomUUID(),sessionHash='fixture',chat={id:randomUUID(),members:[{userId,status:'accepted'}]};d.mvp.chats.push(chat);d.sessions.push({tokenHash:sessionHash,expiresAt:Date.now()+60_000});d.pushSubscriptions=[{...subscription(),id:randomUUID(),userId,sessionHash}];
    queueMessagePush(d,chat,{senderId,audience:[senderId,userId]});const store=memoryStore(d);let calls=0;
    const service=createPushService({...vapid,send:async()=>{calls++;await new Promise(r=>setTimeout(r,5));if(statusCode!==201)throw {statusCode};}});
    await Promise.all([service.drain(store),service.drain(store)]);assert.equal(calls,1);
    const state=store.snapshot();assert.equal(state.pushOutbox.length,statusCode===503?1:0);assert.equal(state.pushSubscriptions.length,statusCode===410?0:1);
    if(statusCode===503){await service.drain(store);assert.equal(calls,1);}
  }
  for(const endpoint of ['https://localhost/a','http://fcm.googleapis.com/a','https://fcm.googleapis.com.evil.test/a','https://fcm.googleapis.com:444/a'])assert.equal(validSubscription({...subscription(),endpoint}),false);
});
test('service worker shows generic notifications only for the current account and opens a safe chat link',async()=>{
  const listeners={},shown=[],navigated=[],userId=randomUUID(),chatId=randomUUID();let currentUser=userId;
  const self={location:{origin:'https://lelekatalk.example'},addEventListener:(name,fn)=>listeners[name]=fn,registration:{showNotification:async(...args)=>shown.push(args)},clients:{matchAll:async()=>[{url:'https://lelekatalk.example/',navigate:async url=>navigated.push(url),focus:async()=>{}}]}};
  vm.runInNewContext(readFileSync(new URL('../phase-one/public/sw.js',import.meta.url),'utf8'),{self,URL,fetch:async()=>({ok:true,json:async()=>({user:{id:currentUser}})})});
  async function push(data){let work;listeners.push({data:{json:()=>data},waitUntil:promise=>work=promise});await work;}
  await push({type:'message',chatId,userId,language:'uk',text:'never display this'});assert.equal(shown.length,1);assert.ok(!JSON.stringify(shown).includes('never display this'));
  currentUser=randomUUID();await push({type:'message',chatId,userId});assert.equal(shown.length,1);
  let work;listeners.notificationclick({notification:{close(){},data:{chatId}},waitUntil:promise=>work=promise});await work;assert.equal(navigated[0],`https://lelekatalk.example/?chat=${chatId}`);
});
