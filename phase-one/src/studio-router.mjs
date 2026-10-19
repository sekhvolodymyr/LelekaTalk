const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function createStudioRouter({database,getSession,blocked,userById,encrypted,readBody,persist,fail}){
  return async function route(request,url,user,reply){
    const path=url.pathname.slice('/api/mvp'.length),method=request.method;
    if(path!=='/studio'&&!path.startsWith('/studio/'))return false;
    const session=getSession(request),now=Date.now();
    const validSession=hash=>database.sessions.some(s=>s.tokenHash===hash&&s.expiresAt>now);
    const live=room=>now-room.seenAt<90000&&validSession(room.sessionHash);
    const viewers=room=>room.viewers.filter(v=>now-v.seenAt<90000&&validSession(v.sessionHash)&&!blocked(room.ownerId,v.userId));
    const identity=(id,name)=>{const u=userById(id);return {id,name:name??u.personalName,publicKey:u.crypto?.publicKey??null,fingerprint:u.crypto?.fingerprint??null};};
    const dto=room=>({id:room.id,title:room.title,author:identity(room.ownerId,room.authorName),createdAt:room.createdAt,viewerCount:viewers(room).length,likes:room.likes.length,liked:room.likes.includes(user.id),shares:room.shares.length,isMine:room.ownerId===user.id,viewerLimit:5});
    const owned=room=>room.ownerId===user.id&&room.sessionHash===session.tokenHash&&room.deviceId===deviceId;
    const uuid=value=>{if(typeof value!=='string'||!UUID.test(value))throw fail(400,'invalid_id');return value;};
    let deviceId;
    if(method==='GET')deviceId=uuid(url.searchParams.get('device'));
    let body;
    if(method==='POST'){
      body=await readBody(request);deviceId=uuid(body.deviceId);
      if(Object.keys(body).some(k=>!['deviceId','id','title','viewerId','ciphertext','type','liked','text'].includes(k)))throw fail(400,'invalid_payload');
      database.studioLives=(database.studioLives??[]).filter(live);
      for(const room of database.studioLives)room.viewers=viewers(room);
    }
    const rooms=database.studioLives??[];
    if(path==='/studio'&&method==='GET')return reply(200,{streams:rooms.filter(r=>live(r)&&!blocked(r.ownerId,user.id)).slice(-30).reverse().map(dto)});
    if(path==='/studio'&&method==='POST'){
      if(!user.crypto)throw fail(409,'keys_required');
      const id=uuid(body.id);if(typeof body.title!=='string'||!body.title.trim()||body.title.trim().length>80)throw fail(400,'invalid_title');
      const existing=rooms.find(r=>r.id===id);if(existing){if(!owned(existing))throw fail(409,'stream_conflict');return reply(200,{stream:dto(existing)});}
      if(rooms.some(r=>r.ownerId===user.id))throw fail(409,'already_live');
      if(rooms.length>=30)throw fail(429,'studio_full');
      const room={id,ownerId:user.id,authorName:user.activeProfile==='creator'?user.creatorName:user.personalName,sessionHash:session.tokenHash,deviceId,title:body.title.trim(),createdAt:now,seenAt:now,viewers:[],comments:[],likes:[],shares:[]};
      database.studioLives??=[];database.studioLives.push(room);persist();return reply(201,{stream:dto(room)});
    }
    const match=/^\/studio\/([a-f0-9-]{36})(?:\/(join|leave|heartbeat|signal|like|comment|share|end))?$/.exec(path);if(!match)throw fail(404,'not_found');
    const room=rooms.find(r=>r.id===match[1]&&live(r)&&!blocked(r.ownerId,user.id));if(!room)throw fail(404,'stream_ended');
    const action=match[2],viewerId=method==='GET'?url.searchParams.get('viewerId'):body?.viewerId;
    const viewer=room.viewers.find(v=>v.id===viewerId&&v.userId===user.id&&v.sessionHash===session.tokenHash&&v.deviceId===deviceId&&now-v.seenAt<90000);
    if(!action&&method==='GET'){
      const visible=owned(room)?viewers(room):viewer?[viewer]:[];
      return reply(200,{stream:dto(room),role:owned(room)?'host':viewer?'viewer':'guest',viewers:visible.map(v=>({id:v.id,person:identity(v.userId),signals:v.signals})),comments:room.comments.filter(c=>!blocked(c.authorId,user.id)).slice(-80),serverTime:Date.now()});
    }
    if(method!=='POST')throw fail(405,'method_not_allowed');
    if(action==='join'){
      if(room.ownerId===user.id)throw fail(409,'host_other_device');if(!user.crypto)throw fail(409,'keys_required');
      const id=uuid(body.viewerId),existing=room.viewers.find(v=>v.id===id);
      if(existing){if(!viewer)throw fail(409,'viewer_conflict');existing.seenAt=now;persist();return reply(200,{stream:dto(room)});}
      if(room.viewers.length>=5)throw fail(409,'stream_full');
      room.viewers.push({id,userId:user.id,sessionHash:session.tokenHash,deviceId,seenAt:now,signals:[]});persist();return reply(201,{stream:dto(room)});
    }
    if(!owned(room)&&!viewer)throw fail(403,'stream_join_required');
    if(action==='end'){if(!owned(room))throw fail(403,'owner_required');database.studioLives=rooms.filter(r=>r!==room);persist();return reply(200,{ok:true});}
    if(action==='leave'){if(viewer)room.viewers=room.viewers.filter(v=>v!==viewer);persist();return reply(200,{ok:true});}
    if(action==='heartbeat'){if(owned(room))room.seenAt=now;else viewer.seenAt=now;persist();return reply(200,{ok:true});}
    if(action==='signal'){
      const target=owned(room)?room.viewers.find(v=>v.id===viewerId):viewer;if(!target)throw fail(404,'viewer_left');
      const type=body.type,id=uuid(body.id),host=owned(room);
      if(!['ice','offer','answer'].includes(type)||type==='offer'&&!host||type==='answer'&&host)throw fail(403,'invalid_signal');
      if(target.signals.some(s=>s.id===id))return reply(200,{ok:true});
      if(target.signals.length>=100)throw fail(429,'signal_limit');
      if(type!=='ice'&&target.signals.some(s=>s.type===type))throw fail(409,'signal_exists');
      const ciphertext=await encrypted(body.ciphertext);
      if(target.signals.reduce((bytes,s)=>bytes+s.ciphertext.length,0)+ciphertext.length>192000)throw fail(429,'signal_limit');
      target.signals.push({id,type,senderId:user.id,ciphertext});persist();return reply(201,{ok:true});
    }
    if(action==='like'){if(typeof body.liked!=='boolean')throw fail(400,'invalid_payload');room.likes=room.likes.filter(id=>id!==user.id);if(body.liked)room.likes.push(user.id);persist();return reply(200,{stream:dto(room)});}
    if(action==='share'){if(!room.shares.includes(user.id))room.shares.push(user.id);persist();return reply(200,{stream:dto(room)});}
    if(action==='comment'){
      const id=uuid(body.id),existing=room.comments.find(c=>c.id===id);
      if(existing){if(existing.authorId!==user.id||existing.text!==body.text?.trim())throw fail(409,'comment_conflict');return reply(200,{ok:true});}
      if(typeof body.text!=='string'||!body.text.trim()||body.text.trim().length>300)throw fail(400,'invalid_text');
      if(room.comments.some(c=>c.authorId===user.id&&now-c.createdAt<1000))throw fail(429,'too_many_attempts');
      room.comments.push({id,authorId:user.id,authorName:user.activeProfile==='creator'?user.creatorName:user.personalName,text:body.text.trim(),createdAt:now});room.comments=room.comments.slice(-80);persist();return reply(201,{ok:true});
    }
    throw fail(404,'not_found');
  };
}
