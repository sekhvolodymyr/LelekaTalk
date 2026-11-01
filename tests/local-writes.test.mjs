import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {createHash,randomUUID} from 'node:crypto';
import {createApp} from '../phase-one/server.mjs';

for(const action of ['comments','repost'])test(`local ${action} and deletion cannot leave orphan records`,async t=>{
  const userId=randomUUID(),postId=randomUUID(),token='a'.repeat(64);
  const database={version:1,users:[{id:userId,username:'alice',personalName:'Alice'}],sessions:[{userId,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:Date.now()+60000}],wall:{sequence:1,posts:[{id:postId,seq:1,authorId:userId,text:'Parent',likes:[],createdAt:new Date().toISOString()}],comments:[],reposts:[]}};
  const server=createApp({managedDatabase:database,pushService:null});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.close();server.closeAllConnections();});
  const origin=`http://127.0.0.1:${server.address().port}`;
  const body=JSON.stringify(action==='comments'?{id:randomUUID(),text:'Reply'}:{reposted:true});
  const options={method:'POST',headers:{Origin:origin,Cookie:`leleka_session=${token}`,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}};
  const complete=req=>new Promise((resolve,reject)=>{req.on('response',res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);});
  const received=once(server,'request');
  const pending=http.request(`${origin}/api/mvp/wall/${postId}/${action}`,options),pendingResult=complete(pending);
  pending.write(body.slice(0,1));await received;
  const deleting=once(server,'request');
  const remove=http.request(`${origin}/api/mvp/wall/${postId}`,{method:'DELETE',headers:options.headers});
  // DELETE carries no JSON body.
  remove.removeHeader('Content-Length');const removed=complete(remove);remove.end();await deleting;
  pending.end(body.slice(1));
  assert.deepEqual(await Promise.all([pendingResult,removed]),[action==='comments'?201:200,200]);
  assert.equal(database.wall.posts.length,0);
  assert.equal(database.wall.comments.length+database.wall.reposts.length,0,'deletion must cascade over concurrent writes');
});
