import { queueMessagePush } from './push-service.mjs';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function createCallRouter({ database, db, getSession, requireChat, blocked, person, userById, encrypted, readBody, persist, fail }) {
  const live = call => {
    if (call.status === 'ended') return false;
    const now = Date.now(), chat = db.chats.find(c => c.id === call.chatId);
    if (!chat || blocked(call.callerId,call.calleeId) || ![call.callerId,call.calleeId].every(id => chat.members.some(m=>m.userId===id && m.status==='accepted'))) return false;
    if (!database.sessions.some(s=>s.tokenHash===call.callerSession && s.expiresAt>now)) return false;
    if (call.status === 'ringing') return now < call.expiresAt;
    return database.sessions.some(s=>s.tokenHash===call.calleeSession && s.expiresAt>now) && now-call.callerSeenAt<60_000 && now-call.calleeSeenAt<60_000;
  };
  const dto = call => ({ id:call.id,chatId:call.chatId,callerId:call.callerId,calleeId:call.calleeId,status:live(call)?call.status:'ended',reason:call.reason??(!live(call)?call.status==='ringing'?'missed':'disconnected':null),createdAt:call.createdAt,expiresAt:call.expiresAt,caller:person(userById(call.callerId)),callee:person(userById(call.calleeId)),offer:live(call)?call.offer:null,answer:live(call)?call.answer:null,signals:live(call)?call.signals:[] });
  const end = (call,reason) => {call.status='ended';call.reason=reason;call.endedAt=Date.now();call.offer=null;call.answer=null;call.signals=[];database.pushOutbox=(database.pushOutbox??[]).filter(job=>job.callId!==call.id);};
  const device = value => {if(typeof value!=='string'||!UUID.test(value))throw fail(400,'invalid_call_device');return value;};
  const owned = (call,user,session,deviceId) => call.callerId===user.id ? call.callerSession===session.tokenHash&&call.callerDevice===deviceId : call.calleeId===user.id && (call.status==='ringing'||call.calleeSession===session.tokenHash&&call.calleeDevice===deviceId);
  return async function route(request,url,user,reply) {
    const path=url.pathname.slice('/api/mvp'.length),method=request.method;
    if(!path.startsWith('/calls'))return false;
    const session=getSession(request);if(!session)throw fail(401,'authentication_required');
    const calls=database.calls??[];
    if(path==='/calls/config'&&method==='GET') {
      let iceServers=[{urls:'stun:stun.l.google.com:19302'}];
      if(process.env.RTC_ICE_SERVERS){try{const configured=JSON.parse(process.env.RTC_ICE_SERVERS);if(!Array.isArray(configured)||configured.length>8||configured.some(s=>!s||!(Array.isArray(s.urls)?s.urls:[s.urls]).every(u=>typeof u==='string'&&/^(stun|stuns|turn|turns):[^\s]+$/.test(u))))throw Error();iceServers=configured;}catch{throw fail(503,'calls_not_configured');}}
      return reply(200,{iceServers,relayConfigured:iceServers.some(s=>(Array.isArray(s.urls)?s.urls:[s.urls]).some(u=>/^turns?:/.test(u)))});
    }
    if(path==='/calls'&&method==='GET') {
      const deviceId=device(url.searchParams.get('device'));
      return reply(200,{calls:calls.filter(call=>owned(call,user,session,deviceId)&&(live(call)||Date.now()-(call.endedAt??call.expiresAt)<120_000)).slice(-10).map(dto),serverTime:Date.now()});
    }
    if(!['POST'].includes(method))throw fail(405,'method_not_allowed');
    const body=await readBody(request),deviceId=device(body.deviceId);
    database.calls??=[];
    for(const call of database.calls)if(call.status!=='ended'&&!live(call))end(call,call.status==='ringing'?'missed':'disconnected');
    database.calls=database.calls.filter(c=>c.status!=='ended'||Date.now()-c.endedAt<10*60_000);
    if(path==='/calls') {
      if(!UUID.test(body.id))throw fail(400,'invalid_id');
      const chat=requireChat(body.chatId,user,true);
      if(chat.type!=='direct'||chat.members.length!==2||chat.members.some(m=>m.status!=='accepted'))throw fail(403,'call_contact_required');
      const callee=chat.members.find(m=>m.userId!==user.id);
      if(blocked(user.id,callee.userId))throw fail(403,'user_blocked');
      if(!user.crypto||!userById(callee.userId)?.crypto)throw fail(409,'keys_required');
      const existing=database.calls.find(c=>c.id===body.id);
      if(existing){if(existing.callerId!==user.id||!owned(existing,user,session,deviceId)||existing.chatId!==chat.id)throw fail(409,'call_conflict');return reply(200,{call:dto(existing)});}
      if(database.calls.some(c=>live(c)&&[c.callerId,c.calleeId].some(id=>id===user.id||id===callee.userId)))throw fail(409,'call_busy');
      if(database.calls.filter(c=>c.callerId===user.id&&Date.now()-c.createdAt<60_000).length>=6)throw fail(429,'call_rate_limit');
      const offer=await encrypted(body.offer);
      if(database.calls.some(c=>live(c)&&[c.callerId,c.calleeId].some(id=>id===user.id||id===callee.userId)))throw fail(409,'call_busy');
      const now=Date.now(),call={id:body.id,chatId:chat.id,callerId:user.id,calleeId:callee.userId,callerSession:session.tokenHash,callerDevice:deviceId,status:'ringing',createdAt:now,expiresAt:now+60_000,callerSeenAt:now,calleeSeenAt:now,offer,answer:null,signals:[]};
      database.calls.push(call);
      queueMessagePush(database,chat,{senderId:user.id,audience:[callee.userId],type:'call',callId:call.id});
      persist();return reply(201,{call:dto(call)});
    }
    const match=/^\/calls\/([a-f0-9-]{36})\/(answer|signals|heartbeat|end)$/.exec(path);
    if(!match)throw fail(404,'not_found');
    const call=database.calls.find(c=>c.id===match[1]);
    if(!call||![call.callerId,call.calleeId].includes(user.id))throw fail(404,'call_not_found');
    if(!owned(call,user,session,deviceId))throw fail(409,'call_other_device');
    const action=match[2];
    if(action==='end'){if(call.status!=='ended')end(call,body.reason==='failed'?'failed':call.status==='ringing'&&user.id===call.calleeId?'declined':'ended');persist();return reply(200,{call:dto(call)});}
    if(!live(call))throw fail(409,'call_ended');
    if(action==='answer') {
      if(user.id!==call.calleeId)throw fail(403,'call_callee_required');
      if(call.status!=='ringing')throw fail(409,'call_already_answered');
      const answer=await encrypted(body.answer);if(call.status!=='ringing')throw fail(409,'call_already_answered');
      call.answer=answer;call.status='accepted';call.calleeSession=session.tokenHash;call.calleeDevice=deviceId;call.calleeSeenAt=Date.now();call.callerSeenAt=Date.now();
    } else if(action==='signals') {
      if(user.id===call.calleeId&&call.status==='ringing')throw fail(403,'call_answer_required');
      if(typeof body.id!=='string'||!UUID.test(body.id))throw fail(400,'invalid_id');
      if(!call.signals.some(s=>s.id===body.id)){
        if(call.signals.length>=80)throw fail(429,'call_signal_limit');
        call.signals.push({id:body.id,senderId:user.id,ciphertext:await encrypted(body.ciphertext)});
      }
    } else if(action==='heartbeat') {
      if(user.id===call.callerId)call.callerSeenAt=Date.now();else call.calleeSeenAt=Date.now();
    }
    persist();return reply(200,{call:dto(call)});
  };
}
