import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {once} from 'node:events';
import http from 'node:http';
import {createCloudApp} from '../src/cloud-app.mjs';
import {emptyDatabase} from '../src/postgres-store.mjs';

async function fixture(t){
  let database=emptyDatabase(),tail=Promise.resolve();
  const actors=['alice','bob','carol'].map((name,index)=>({id:randomUUID(),username:name,personalName:name,email:`${name}@private.test`,token:String(index+1).repeat(64)}));
  database.users=actors;database.sessions=actors.map(a=>({userId:a.id,tokenHash:createHash('sha256').update(a.token).digest('hex'),expiresAt:Date.now()+3600000}));
  const store={run(mutating,action){const operation=tail.then(async()=>{const copy=structuredClone(database),result=await action(copy);if(mutating)database=copy;return result;});tail=operation.catch(()=>{});return operation;}};
  const server=createCloudApp({store,allowedOrigins:['https://lelekatalk.example'],pushService:null});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{server.close();server.closeAllConnections();await once(server,'close');});
  const call=(actor,path='',method='GET',body)=>new Promise((resolve,reject)=>{const data=body?JSON.stringify(body):undefined;const req=http.request(`http://127.0.0.1:${server.address().port}/api/mvp/wall${path}`,{method,headers:{Host:'lelekatalk.example',Origin:'https://lelekatalk.example',...(actor?{Cookie:`leleka_session=${actor.token}`} : {}),...(data?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}:{})}},res=>{const parts=[];res.on('data',x=>parts.push(x));res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(Buffer.concat(parts).toString())}));});req.on('error',reject);req.end(data);});
  const post=(actor=actors[0],text='A thought')=>call(actor,'','POST',{id:randomUUID(),text});
  return {actors,store,call,post,state:()=>database};
}

test('wall requires authentication, validates text, preserves post ownership and retries without duplicates',async t=>{
  const f=await fixture(t),[alice,bob]=f.actors;
  assert.equal((await f.call(null)).status,401);
  for(const text of ['', ' '.repeat(3),'x'.repeat(501),{}])assert.equal((await f.post(alice,text)).status,400);
  const body={id:randomUUID(),text:'  Hello <script>not executable</script>  ',authorId:bob.id};
  const first=await f.call(alice,'','POST',body);assert.equal(first.status,201);assert.equal(first.data.post.author.id,alice.id);assert.equal(first.data.post.text,body.text.trim());
  assert.deepEqual(Object.keys(first.data.post.author).sort(),['id','name','username']);
  assert.equal((await f.call(alice,'','POST',body)).status,200);
  assert.equal((await f.call(bob,'','POST',body)).status,409);
  assert.equal((await f.call(alice,'','POST',{...body,text:'changed'})).status,409);
  assert.equal((await f.call(bob)).data.entries.length,1);
  assert.equal((await f.call(bob,'?mode=mine')).data.entries.length,0);
  assert.equal((await f.call(bob,`/${body.id}`,'DELETE')).status,403);
});

test('likes and comments persist across cloud requests and only authors or post owners can delete comments',async t=>{
  const f=await fixture(t),[alice,bob,carol]=f.actors,id=(await f.post()).data.post.id;
  for(let i=0;i<2;i++)assert.equal((await f.call(bob,`/${id}/like`,'POST',{liked:true})).data.post.likes,1);
  assert.equal((await f.call(carol,`/${id}/like`,'POST',{liked:true})).data.post.likes,2);
  assert.equal((await f.call(bob,`/${id}/like`,'POST',{liked:false})).data.post.likes,1);
  assert.equal((await f.call(bob,`/${id}/like`,'POST',{liked:'yes'})).status,400);
  const comment={id:randomUUID(),text:'A reply'};assert.equal((await f.call(bob,`/${id}/comments`,'POST',comment)).status,201);
  assert.equal((await f.call(bob,`/${id}/comments`,'POST',comment)).status,200);
  const detail=await f.call(alice,`/${id}`);assert.equal(detail.data.comments.length,1);assert.equal(detail.data.post.commentCount,1);assert.equal(detail.data.comments[0].author.id,bob.id);
  assert.equal((await f.call(carol,`/${id}/comments/${comment.id}`,'DELETE')).status,403);
  assert.equal((await f.call(alice,`/${id}/comments/${comment.id}`,'DELETE')).status,200);
  assert.equal((await f.call(bob,`/${id}`)).data.post.commentCount,0);
});

test('reposts are idempotent wall entries, blocked authors are hidden and post deletion cascades',async t=>{
  const f=await fixture(t),[alice,bob,carol]=f.actors,id=(await f.post()).data.post.id;
  for(let i=0;i<2;i++)assert.equal((await f.call(bob,`/${id}/repost`,'POST',{reposted:true})).data.post.reposts,1);
  const mine=(await f.call(bob,'?mode=mine')).data.entries;assert.equal(mine.length,1);assert.equal(mine[0].repostBy.id,bob.id);assert.equal(mine[0].post.author.id,alice.id);
  await f.call(carol,`/${id}/comments`,'POST',{id:randomUUID(),text:'Reply'});
  await f.store.run(true,d=>d.mvp.blocks.push({from:alice.id,to:bob.id}));
  assert.equal((await f.call(bob)).data.entries.length,0);assert.equal((await f.call(bob,`/${id}/like`,'POST',{liked:true})).status,404);
  assert.equal((await f.call(alice)).data.entries.length,1,'blocked repost author hidden');
  await f.call(alice,`/${id}`,'DELETE');assert.equal((await f.call(carol,`/${id}`)).status,404);
  assert.equal(f.state().wall.comments.length,0);assert.equal(f.state().wall.reposts.length,0);
});

test('wall paginates chronologically, filters mine, undoes reposts and limits posting bursts',async t=>{
  const f=await fixture(t),[alice,bob]=f.actors,id=(await f.post()).data.post.id;
  await f.call(bob,`/${id}/repost`,'POST',{reposted:true});await f.call(bob,`/${id}/repost`,'POST',{reposted:false});assert.equal((await f.call(bob,'?mode=mine')).data.entries.length,0);
  for(let i=0;i<9;i++)assert.equal((await f.post()).status,201);assert.equal((await f.post()).status,429);
  await f.store.run(true,d=>{for(let i=0;i<25;i++)d.wall.posts.push({id:randomUUID(),seq:++d.wall.sequence,authorId:bob.id,text:String(i),likes:[],createdAt:new Date().toISOString()});});
  const first=(await f.call(alice)).data,second=(await f.call(alice,`?before=${first.nextCursor}`)).data;
  assert.equal(first.entries.length,30);assert.equal(second.entries.length,5);assert.equal(second.nextCursor,null);assert.equal(new Set([...first.entries,...second.entries].map(e=>e.id)).size,35);
  assert.equal((await f.call(alice,'?mode=mine')).data.entries.length,10);assert.equal((await f.call(alice,'?before=bad')).status,400);
});
