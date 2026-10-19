import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {once} from 'node:events';
import http from 'node:http';
import {createCloudApp} from '../src/cloud-app.mjs';
import {emptyDatabase} from '../src/postgres-store.mjs';
const require=createRequire(new URL('../phase-one/package.json',import.meta.url)),pgp=require('openpgp');
const pair=await pgp.generateKey({type:'ecc',curve:'curve25519',userIDs:[{name:'Calls fixture'}]});
const ciphertext=await pgp.encrypt({message:await pgp.createMessage({text:'v=0\r\nprivate SDP and network candidates'}),encryptionKeys:await pgp.readKey({armoredKey:pair.publicKey})});
async function fixture(t){
  let database=emptyDatabase(),tail=Promise.resolve();
  const actors=['alice','bob','other','four','five','six','seven'].map((name,index)=>({id:randomUUID(),username:name,personalName:name,token:String(index+1).repeat(64),deviceId:randomUUID(),crypto:{publicKey:pair.publicKey,fingerprint:'fixture'}}));
  database.users=actors;database.sessions=actors.map(a=>({userId:a.id,tokenHash:createHash('sha256').update(a.token).digest('hex'),expiresAt:Date.now()+3600_000}));
  const chats=[[0,1],[1,2]].map(members=>({id:randomUUID(),type:'direct',revision:1,ownerId:actors[members[0]].id,members:members.map(i=>({userId:actors[i].id,status:'accepted'}))}));database.mvp.chats=chats;
  const store={run(mutating,action){const operation=tail.then(async()=>{const copy=structuredClone(database),result=await action(copy);if(mutating)database=copy;return result;});tail=operation.catch(()=>{});return operation;}};
  const server=createCloudApp({store,allowedOrigins:['https://lelekatalk.example'],pushService:null});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{server.close();server.closeAllConnections();await once(server,'close');});
  async function call(actor,path='',method='GET',body){const data=body?JSON.stringify({deviceId:actor?.deviceId,...body}):undefined;return new Promise((resolve,reject)=>{const request=http.request(`http://127.0.0.1:${server.address().port}/api/${path}`,{method,headers:{Host:'lelekatalk.example',Origin:'https://lelekatalk.example',...(actor?{Cookie:`leleka_session=${actor.token}`} : {}),...(data?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}:{})}},response=>{const parts=[];response.on('data',x=>parts.push(x));response.on('end',()=>resolve({status:response.statusCode,data:JSON.parse(Buffer.concat(parts).toString())}));});request.on('error',reject);request.end(data);});}
  const list=actor=>call(actor,`mvp/calls?device=${actor.deviceId}`);
  const create=(actor=actors[0],chat=chats[0])=>call(actor,'mvp/calls','POST',{id:randomUUID(),chatId:chat.id,offer:ciphertext});
  return {actors,chats,store,call,list,create,state:()=>database};
}

test('studio accepts metadata only, requires keys, and binds hosts to their session and device',async t=>{
  const f=await fixture(t),[host,viewer]=f.actors,id=randomUUID();
  const call=(a,suffix='',method='POST',body={})=>f.call(a,`mvp/studio${suffix}`,method,body);
  assert.equal((await call(null,'?device='+host.deviceId,'GET')).status,401);
  assert.equal((await call(host,'','POST',{id,title:'Live',video:'blob'})).status,400);
  assert.equal((await call(host,'','POST',{id,title:'Live'})).status,201);
  assert.equal((await call(host,'','POST',{id:randomUUID(),title:'Second'})).status,409);
  assert.equal((await call({...host,deviceId:randomUUID()},`/${id}/end`)).status,403);
  assert.equal((await call(viewer,`/${id}/end`)).status,403);
  const guest=(await call(viewer,`/${id}?device=${viewer.deviceId}`,'GET')).data;
  assert.equal(guest.role,'guest');assert.deepEqual(guest.viewers,[]);
  assert.equal(JSON.stringify(guest).includes('sessionHash'),false);
  assert.equal((await call(host,`/${id}/end`)).status,200);
  assert.deepEqual(f.state().studioLives,[]);
});

test('studio limits viewers, isolates encrypted signaling and supports comments, likes and shares',async t=>{
  const f=await fixture(t),[host,viewer,outsider]=f.actors,id=randomUUID();
  const call=(a,suffix='',method='POST',body={})=>f.call(a,`mvp/studio${suffix}`,method,body);
  await call(host,'','POST',{id,title:'Live'});const viewerId=randomUUID();
  assert.equal((await call(viewer,`/${id}/join`,'POST',{viewerId})).status,201);
  assert.equal((await call({...viewer,deviceId:randomUUID()},`/${id}/heartbeat`,'POST',{viewerId})).status,403);
  assert.equal((await call(viewer,`/${id}/signal`,'POST',{viewerId,id:randomUUID(),type:'offer',ciphertext})).status,403);
  assert.equal((await call(host,`/${id}/signal`,'POST',{viewerId,id:randomUUID(),type:'offer',ciphertext:'plaintext SDP'})).status,400);
  const signal={viewerId,id:randomUUID(),type:'offer',ciphertext};
  assert.equal((await call(host,`/${id}/signal`,'POST',signal)).status,201);
  assert.equal((await call(host,`/${id}/signal`,'POST',signal)).status,200);
  assert.equal((await call(outsider,`/${id}?device=${outsider.deviceId}&viewerId=${viewerId}`,'GET')).data.viewers.length,0);
  assert.equal((await call(viewer,`/${id}?device=${viewer.deviceId}&viewerId=${viewerId}`,'GET')).data.viewers[0].signals.length,1);
  const comment={viewerId,id:randomUUID(),text:'Hello live'};
  assert.equal((await call(viewer,`/${id}/comment`,'POST',comment)).status,201);
  assert.equal((await call(viewer,`/${id}/comment`,'POST',comment)).status,200);
  for(let i=0;i<2;i++)await call(viewer,`/${id}/like`,'POST',{viewerId,liked:true});
  for(let i=0;i<2;i++)await call(viewer,`/${id}/share`,'POST',{viewerId});
  let stream=(await call(host,`/${id}?device=${host.deviceId}`,'GET')).data;
  assert.equal(stream.stream.likes,1);assert.equal(stream.stream.shares,1);assert.equal(stream.comments.length,1);
  for(const actor of f.actors.slice(2,6))assert.equal((await call(actor,`/${id}/join`,'POST',{viewerId:randomUUID()})).status,201);
  assert.equal((await call(f.actors[6],`/${id}/join`,'POST',{viewerId:randomUUID()})).data.error,'stream_full');
  assert.equal(JSON.stringify(f.state().studioLives).includes('private SDP'),false);
  await call(host,`/${id}/end`);
  assert.deepEqual(f.state().studioLives,[]);
  assert.equal((await call(viewer,`/${id}?device=${viewer.deviceId}`,'GET')).status,404);
});

test('abandoned and blocked streams disappear; logout removes host state and viewer signaling',async t=>{
  const f=await fixture(t),[host,viewer]=f.actors;
  const create=async()=>{const id=randomUUID();await f.call(host,'mvp/studio','POST',{id,title:'Live'});return id;};
  let id=await create();const viewerId=randomUUID();
  await f.call(viewer,`mvp/studio/${id}/join`,'POST',{viewerId});
  await f.call(viewer,'logout','POST',{});assert.equal(f.state().studioLives[0].viewers.length,0);
  await f.store.run(true,d=>{d.studioLives[0].seenAt=Date.now()-91000;});
  assert.deepEqual((await f.call(host,`mvp/studio?device=${host.deviceId}`)).data.streams,[]);
  id=await create();assert.equal(f.state().studioLives.length,1,'expired rooms purged on mutation');
  await f.store.run(true,d=>{d.mvp.blocks.push({from:host.id,to:f.actors[2].id});});
  assert.deepEqual((await f.call(f.actors[2],`mvp/studio?device=${f.actors[2].deviceId}`)).data.streams,[]);
  await f.call(host,'logout','POST',{});assert.deepEqual(f.state().studioLives,[]);
});
