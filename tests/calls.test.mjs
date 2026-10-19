import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {once} from 'node:events';
import http from 'node:http';
import {createCloudApp} from '../src/cloud-app.mjs';
import {emptyDatabase} from '../src/postgres-store.mjs';
import {validateCallDescription} from '../phase-one/public/call-description.js';
const require=createRequire(new URL('../phase-one/package.json',import.meta.url)),pgp=require('openpgp');
const pair=await pgp.generateKey({type:'ecc',curve:'curve25519',userIDs:[{name:'Calls fixture'}]});
const ciphertext=await pgp.encrypt({message:await pgp.createMessage({text:'v=0\r\nprivate SDP and network candidates'}),encryptionKeys:await pgp.readKey({armoredKey:pair.publicKey})});
async function fixture(t){
  let database=emptyDatabase(),tail=Promise.resolve();
  const actors=['alice','bob','other'].map((name,index)=>({id:randomUUID(),username:name,personalName:name,token:String(index+1).repeat(64),deviceId:randomUUID(),crypto:{publicKey:pair.publicKey,fingerprint:'fixture'}}));
  database.users=actors;database.sessions=actors.map(a=>({userId:a.id,tokenHash:createHash('sha256').update(a.token).digest('hex'),expiresAt:Date.now()+3600_000}));
  const chats=[[0,1],[1,2]].map(members=>({id:randomUUID(),type:'direct',revision:1,ownerId:actors[members[0]].id,members:members.map(i=>({userId:actors[i].id,status:'accepted'}))}));database.mvp.chats=chats;
  const store={run(mutating,action){const operation=tail.then(async()=>{const copy=structuredClone(database),result=await action(copy);if(mutating)database=copy;return result;});tail=operation.catch(()=>{});return operation;}};
  const server=createCloudApp({store,allowedOrigins:['https://lelekatalk.example'],pushService:null});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{server.close();server.closeAllConnections();await once(server,'close');});
  async function call(actor,path='',method='GET',body){const data=body?JSON.stringify({deviceId:actor?.deviceId,...body}):undefined;return new Promise((resolve,reject)=>{const request=http.request(`http://127.0.0.1:${server.address().port}/api/${path}`,{method,headers:{Host:'lelekatalk.example',Origin:'https://lelekatalk.example',...(actor?{Cookie:`leleka_session=${actor.token}`} : {}),...(data?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}:{})}},response=>{const parts=[];response.on('data',x=>parts.push(x));response.on('end',()=>resolve({status:response.statusCode,data:JSON.parse(Buffer.concat(parts).toString())}));});request.on('error',reject);request.end(data);});}
  const list=actor=>call(actor,`mvp/calls?device=${actor.deviceId}`);
  const create=(actor=actors[0],chat=chats[0])=>call(actor,'mvp/calls','POST',{id:randomUUID(),chatId:chat.id,offer:ciphertext});
  return {actors,chats,store,call,list,create,state:()=>database};
}
test('only mutually accepted unblocked direct contacts can call; outsiders cannot read or signal',async t=>{
  const f=await fixture(t),[alice,bob,other]=f.actors;
  assert.equal((await f.call(null,'mvp/calls/config')).status,401);
  assert.equal((await f.create(other)).status,404);
  assert.equal((await f.call(alice,'mvp/calls','POST',{id:randomUUID(),chatId:f.chats[0].id,offer:'v=0 plaintext'})).status,400);
  await f.store.run(true,d=>{d.mvp.chats[0].members[1].status='invited';});assert.equal((await f.create()).status,403);
  await f.store.run(true,d=>{d.mvp.chats[0].members[1].status='accepted';d.mvp.blocks.push({from:bob.id,to:alice.id});});assert.equal((await f.create()).status,403);
  await f.store.run(true,d=>{d.mvp.blocks=[];});const result=await f.create();assert.equal(result.status,201);
  assert.deepEqual((await f.list(other)).data.calls,[]);
  assert.equal((await f.call(other,`mvp/calls/${result.data.call.id}/signals`,'POST',{id:randomUUID(),ciphertext})).status,404);
  assert.equal((await f.list(bob)).data.calls[0].callerId,alice.id);
  assert.ok(!JSON.stringify(f.state().calls).includes('private SDP'));
});
test('answer is bound to one receiving device and busy participants cannot start a second call',async t=>{
  const f=await fixture(t),[alice,bob,other]=f.actors,id=(await f.create()).data.call.id;
  assert.equal((await f.call(alice,`mvp/calls/${id}/answer`,'POST',{answer:ciphertext})).status,403);
  assert.equal((await f.call(bob,`mvp/calls/${id}/signals`,'POST',{id:randomUUID(),ciphertext})).status,403);
  assert.equal((await f.create(other,f.chats[1])).data.error,'call_busy');
  assert.equal((await f.call(bob,`mvp/calls/${id}/answer`,'POST',{answer:ciphertext})).status,200);
  const anotherDevice={...bob,deviceId:randomUUID()};assert.deepEqual((await f.list(anotherDevice)).data.calls,[]);
  assert.equal((await f.call(anotherDevice,`mvp/calls/${id}/answer`,'POST',{answer:ciphertext})).status,409);
  const signal={id:randomUUID(),ciphertext};await f.call(alice,`mvp/calls/${id}/signals`,'POST',signal);await f.call(alice,`mvp/calls/${id}/signals`,'POST',signal);
  assert.equal((await f.list(bob)).data.calls[0].signals.length,1);
  assert.equal((await f.call({...alice,deviceId:randomUUID()},`mvp/calls/${id}/end`,'POST',{})).status,409);
});
test('declining and signing out end calls and remove encrypted signaling material',async t=>{
  const f=await fixture(t),[alice,bob]=f.actors;
  let id=(await f.create()).data.call.id;
  await f.call(bob,`mvp/calls/${id}/end`,'POST',{});assert.equal((await f.list(alice)).data.calls[0].reason,'declined');
  assert.equal(f.state().calls[0].offer,null);
  id=(await f.create()).data.call.id;await f.call(bob,`mvp/calls/${id}/answer`,'POST',{answer:ciphertext});await f.call(bob,'logout','POST',{});
  const result=(await f.list(alice)).data.calls.find(c=>c.id===id);assert.equal(result.status,'ended');assert.equal(result.answer,null);assert.deepEqual(result.signals,[]);
});
test('ringing times out and one active participant cannot keep an abandoned call alive',async t=>{
  const f=await fixture(t),[alice,bob]=f.actors;let id=(await f.create()).data.call.id;
  await f.store.run(true,d=>{d.calls[0].expiresAt=Date.now()-1;});assert.equal((await f.list(alice)).data.calls[0].reason,'missed');
  id=(await f.create()).data.call.id;await f.call(bob,`mvp/calls/${id}/answer`,'POST',{answer:ciphertext});
  await f.store.run(true,d=>{d.calls.find(c=>c.id===id).callerSeenAt=Date.now()-61_000;});
  assert.equal((await f.list(bob)).data.calls.find(c=>c.id===id).status,'ended');
  assert.equal((await f.call(bob,`mvp/calls/${id}/heartbeat`,'POST',{})).status,409);
});

test('video call mode is validated, persisted and immutable; legacy calls default to audio',async t=>{
  const f=await fixture(t),[alice,bob]=f.actors,id=randomUUID(),body={id,chatId:f.chats[0].id,offer:ciphertext};
  assert.equal((await f.call(alice,'mvp/calls','POST',{...body,media:'screen'})).status,400);
  const created=await f.call(alice,'mvp/calls','POST',{...body,media:'video'});assert.equal(created.status,201);assert.equal(created.data.call.media,'video');
  assert.equal((await f.list(bob)).data.calls[0].media,'video');
  assert.equal((await f.call(alice,'mvp/calls','POST',{...body,media:'audio'})).status,409);
  await f.call(bob,`mvp/calls/${id}/end`,'POST',{});
  const audio=await f.create();assert.equal(audio.data.call.media,'audio');
  await f.store.run(true,d=>{delete d.calls.find(c=>c.id===audio.data.call.id).media;});
  assert.equal((await f.list(bob)).data.calls.find(c=>c.id===audio.data.call.id).media,'audio');
});

test('signed descriptions bind camera consent to media mode and reject video in audio calls',()=>{
  const description={type:'offer',sdp:'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n'};
  assert.equal(validateCallDescription({media:'video',description},{media:'video'},'offer'),description);
  assert.throws(()=>validateCallDescription({media:'video',description},{media:'audio'},'offer'));
  assert.throws(()=>validateCallDescription({description},{media:'audio'},'offer'));
  assert.throws(()=>validateCallDescription({description},{media:'video'},'offer'));
  assert.throws(()=>validateCallDescription({media:'video',description},{media:'video'},'answer'));
  const audio={type:'offer',sdp:'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n'};
  assert.equal(validateCallDescription({description:audio},{},'offer'),audio);
  assert.throws(()=>validateCallDescription({media:'video',description:audio},{media:'video'},'offer'));
});
