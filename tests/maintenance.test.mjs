import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {once} from 'node:events';
import http from 'node:http';
import {createCloudApp} from '../src/cloud-app.mjs';
import {emptyDatabase} from '../src/postgres-store.mjs';
import {createApp} from '../phase-one/server.mjs';
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

test('forward pages preserve every unseen message while initial and backward pages show latest history',async t=>{
 const f=await fixture(t),[alice]=f.actors,id=f.chats[0].id;
 await f.store.run(true,d=>{d.mvp.messages=Array.from({length:260},(_,i)=>({id:randomUUID(),seq:i+1,chatId:id,audience:[alice.id],ciphertext:'fixture',createdAt:new Date().toISOString()}));});
 const read=query=>f.call(alice,`mvp/chats/${id}/messages${query}`);
 assert.equal((await read('')).data.messages[0].seq,161);
 let after=10,seen=[];
 do{const result=(await read(`?after=${after}`)).data;seen.push(...result.messages.map(m=>m.seq));after=result.messages.at(-1)?.seq??after;if(!result.hasMore)break;}while(seen.length<400);
 assert.deepEqual(seen,Array.from({length:250},(_,i)=>i+11));
 assert.equal((await read('?before=161')).data.messages.at(-1).seq,160);
});

test('legacy channel comments have bounded previews and complete cursor history without deletion',async t=>{
 const f=await fixture(t),[alice,bob]=f.actors,channelId=randomUUID(),postId=randomUUID();
 await f.store.run(true,d=>{d.mvp.channels.push({id:channelId,ownerId:alice.id,title:'Channel',followers:[],topic:'creative'});d.mvp.posts.push({id:postId,channelId,text:'Post',likes:[],createdAt:new Date().toISOString()});d.mvp.comments=Array.from({length:250},(_,i)=>({id:randomUUID(),postId,authorId:alice.id,authorName:'alice',text:`Comment ${i}`,createdAt:'2020-01-01T00:00:00Z'}));});
 const feed=(await f.call(bob,'mvp/feed')).data.posts[0];assert.equal(feed.commentCount,250);assert.ok(feed.comments.length<=10);
 let cursor='',ids=new Set();
 do{const page=(await f.call(bob,`mvp/posts/${postId}/comments${cursor?`?before=${cursor}`:''}`)).data;assert.ok(page.comments.length<=50);for(const c of page.comments)ids.add(c.id);cursor=page.nextCursor;}while(cursor);
 assert.equal(ids.size,250);assert.equal(f.state().mvp.comments.length,250);
 for(let i=0;i<30;i++)assert.equal((await f.call(bob,`mvp/posts/${postId}/comments`,'POST',{text:'Allowed comment'})).status,201);
 assert.equal((await f.call(bob,`mvp/posts/${postId}/comments`,'POST',{text:'Too many'})).status,429);
});

test('long-lived local chat counts follow each audience and refresh after new messages',async t=>{
 const database=emptyDatabase(),alice={id:randomUUID(),personalName:'Alice'},bob={id:randomUUID(),personalName:'Bob'},chatId=randomUUID();
 database.users=[alice,bob];database.sessions=[alice,bob].map((a,i)=>({userId:a.id,tokenHash:createHash('sha256').update(String(i+1).repeat(64)).digest('hex'),expiresAt:Date.now()+60000}));
 database.mvp.chats=[{id:chatId,type:'group',ownerId:alice.id,revision:1,members:[alice,bob].map(a=>({userId:a.id,status:'accepted'})),updatedAt:new Date().toISOString()}];
 database.mvp.messages=[{chatId,audience:[alice.id],seq:1},{chatId,audience:[alice.id,bob.id],seq:2}];
 const server=createApp({managedDatabase:database,pushService:null});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.close();server.closeAllConnections();});
 const count=async i=>(await(await fetch(`http://127.0.0.1:${server.address().port}/api/mvp/chats`,{headers:{Cookie:`leleka_session=${String(i+1).repeat(64)}`}})).json()).chats[0].messageCount;
 assert.equal(await count(0),2);assert.equal(await count(1),1);
 database.mvp.messages.push({chatId,audience:[alice.id,bob.id],seq:3});assert.equal(await count(1),2);assert.equal(await count(0),3);
});

test('async password hashing preserves registration uniqueness under concurrent local requests',async t=>{
 const database=emptyDatabase(),server=createApp({managedDatabase:database,pushService:null});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.close();server.closeAllConnections();});
 const origin=`http://127.0.0.1:${server.address().port}`,body=JSON.stringify({email:'concurrent@example.test',username:'concurrent',name:'Concurrent',password:'a-long-test-password',ageConfirmed:true});
 const register=()=>fetch(origin+'/api/register',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body});
 assert.deepEqual((await Promise.all([register(),register()])).map(r=>r.status).sort(),[201,409]);assert.equal(database.users.length,1);
});
