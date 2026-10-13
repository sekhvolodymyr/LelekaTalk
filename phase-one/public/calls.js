export function createAudioCalls({ api, getState, encryption, escapeHTML: e, toast }) {
  const labels = {
    uk:{call:'Аудіодзвінок',incoming:'Вхідний аудіодзвінок',dialing:'Телефонуємо…',connecting:'З’єднуємо…',connected:'Розмова',accept:'Прийняти',decline:'Відхилити',end:'Завершити',mute:'Вимкнути мікрофон',unmute:'Увімкнути мікрофон',sound:'Увімкнути звук',ended:'Дзвінок завершено',declined:'Виклик відхилено',missed:'Немає відповіді',disconnected:'З’єднання втрачено',failed:'Не вдалося з’єднати дзвінок. Спробуй іншу мережу.',busy:'Контакт уже розмовляє',mic:'Дозволь доступ до мікрофона для дзвінка.',unsupported:'Цей браузер не підтримує аудіодзвінки.',locked:'Спочатку розблокуй приватні дані.',error:'Не вдалося виконати дію дзвінка.',close:'Закрити'},
    en:{call:'Audio call',incoming:'Incoming audio call',dialing:'Calling…',connecting:'Connecting…',connected:'In call',accept:'Accept',decline:'Decline',end:'End call',mute:'Mute microphone',unmute:'Unmute microphone',sound:'Enable audio',ended:'Call ended',declined:'Call declined',missed:'No answer',disconnected:'Connection lost',failed:'Could not connect. Try another network.',busy:'Contact is already in a call',mic:'Allow microphone access to make a call.',unsupported:'This browser does not support audio calls.',locked:'Unlock your private data first.',error:'Call action failed.',close:'Close'},
  };
  const t = key => labels[getState().language==='en'?'en':'uk'][key] ?? key;
  // Each open page is a distinct device for call ownership. Tabs opened from
  // another tab must not inherit its call or end its active PeerConnection.
  const deviceId=crypto.randomUUID();
  const panel=document.createElement('section');panel.id='audio-call-panel';panel.hidden=true;panel.setAttribute('role','region');panel.setAttribute('aria-label',t('call'));document.body.append(panel);
  const remoteAudio=document.createElement('audio');remoteAudio.autoplay=true;remoteAudio.setAttribute('playsinline','');remoteAudio.id='call-remote-audio';document.body.append(remoteAudio);
  let user,active,pc,stream,config,pollTimer,heartbeatTimer,tickTimer,connectTimer,disconnectTimer,closeTimer;
  let phase='idle',working=false,polling=false,version=0,actionGeneration=0,registered=false,flushing=false,muted=false,needsSound=false,connectedAt=0;
  let ringContext,ringTimer;const ringTones=new Set();
  function ring(){if(ringContext?.state!=='running')return;for(const offset of [0,.35]){const tone=ringContext.createOscillator(),gain=ringContext.createGain();tone.frequency.value=660;gain.gain.value=.035;tone.connect(gain);gain.connect(ringContext.destination);tone.start(ringContext.currentTime+offset);tone.stop(ringContext.currentTime+offset+.2);ringTones.add(tone);tone.onended=()=>ringTones.delete(tone);}}
  function stopRing(){clearInterval(ringTimer);ringTimer=null;for(const tone of ringTones){try{tone.stop();}catch{}}ringTones.clear();}
  document.addEventListener('pointerdown',()=>{if(!ringContext&&('AudioContext'in window))ringContext=new AudioContext();ringContext?.resume().catch(()=>{});});
  let seenSignals=new Set(),pendingCandidates=[],remoteCandidates=[];
  const supported=()=>window.isSecureContext&&Boolean(navigator.mediaDevices?.getUserMedia)&&'RTCPeerConnection'in window;
  const request=(path,options)=>api(`mvp/calls${path}`,options);
  const post=(path,body={})=>request(path,{method:'POST',body:{...body,deviceId}});
  const peer=()=>active?.callerId===user?.id?active?.callee:active?.caller;
  function render() {
    for(const button of document.querySelectorAll('[data-audio-call]'))button.disabled=!supported()||!encryption.unlocked()||working||['incoming','dialing','connecting','connected'].includes(phase);
    panel.hidden=phase==='idle';if(panel.hidden)return;
    const elapsed=connectedAt?Math.floor((performance.now()-connectedAt)/1000):0;
    const duration=`${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(elapsed%60).padStart(2,'0')}`;
    panel.innerHTML=`<div class="call-heading"><span class="call-icon" aria-hidden="true">☎</span><div><strong>${e(peer()?.name??t('call'))}</strong><p class="call-status" aria-live="polite">${e(t(phase))}${phase==='connected'?` · <span id="call-duration">${duration}</span>`:''}</p></div></div><div class="call-controls">${phase==='incoming'?`<button class="button call-accept" data-call="accept" ${working||!supported()||!encryption.unlocked()?'disabled':''}>${t('accept')}</button><button class="button call-end" data-call="end">${t('decline')}</button>`:['dialing','connecting','connected'].includes(phase)?`${stream?`<button class="button secondary" data-call="mute" aria-pressed="${muted}">${t(muted?'unmute':'mute')}</button>`:''}${needsSound?`<button class="button secondary" data-call="sound">${t('sound')}</button>`:''}<button class="button call-end" data-call="end">${t('end')}</button>`:`<button class="button secondary" data-call="close">${t('close')}</button>`}</div>`;
  }
  function release() {
    stopRing();
    clearInterval(heartbeatTimer);clearInterval(tickTimer);clearTimeout(connectTimer);clearTimeout(disconnectTimer);
    if(pc){pc.onicecandidate=null;pc.ontrack=null;pc.onconnectionstatechange=null;pc.close();pc=null;}
    stream?.getTracks().forEach(track=>track.stop());stream=null;remoteAudio.pause();remoteAudio.srcObject=null;
    pendingCandidates=[];remoteCandidates=[];seenSignals.clear();registered=false;muted=false;needsSound=false;connectedAt=0;
  }
  function finish(reason='ended') {release();phase=reason in labels.uk?reason:'ended';render();clearTimeout(closeTimer);closeTimer=setTimeout(()=>{active=null;phase='idle';render();},5000);}
  function report(error){toast(error.code==='call_busy'?t('busy'):['NotAllowedError','NotFoundError','NotReadableError'].includes(error.name)?t('mic'):!encryption.unlocked()?t('locked'):t('error'));}
  async function microphone(){if(!supported())throw Error('unsupported');if(!encryption.unlocked())throw Error('keys_locked');return navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});}
  async function signal(type,content) {
    const call=active;if(!call||!registered)return;
    const id=crypto.randomUUID();
    const ciphertext=await encryption.encryptEnvelope({kind:'call-signal',id,callId:call.id,senderId:user.id,type,...content},[call.caller,call.callee]);
    if(active?.id!==call.id)return;
    await post(`/${call.id}/signals`,{id,ciphertext});
  }
  async function flush() {
    if(flushing||!registered||!active||!pendingCandidates.length)return;
    flushing=true;const callId=active.id;
    try {while(pendingCandidates.length&&registered&&active){const candidates=pendingCandidates.splice(0,20);await signal('ice',{candidates});}}
    catch(error){if(active?.id===callId)await hangup('failed');}
    finally{flushing=false;}
  }
  async function makePeer() {
    const captured=stream;
    config??=await request('/config');
    if(!captured||stream!==captured)return;
    pc=new RTCPeerConnection({iceServers:config.iceServers});const connection=pc;
    stream.getTracks().forEach(track=>connection.addTrack(track,stream));
    connection.onicecandidate=event=>{if(pc!==connection||!event.candidate)return;pendingCandidates.push(event.candidate.toJSON());void flush();};
    connection.ontrack=event=>{if(pc!==connection)return;remoteAudio.srcObject=event.streams[0]??new MediaStream([event.track]);remoteAudio.play().catch(()=>{needsSound=true;render();});};
    connection.onconnectionstatechange=()=>{
      if(pc!==connection)return;
      if(connection.connectionState==='connected'){clearTimeout(connectTimer);clearTimeout(disconnectTimer);phase='connected';connectedAt||=performance.now();render();clearInterval(tickTimer);tickTimer=setInterval(()=>{const el=document.querySelector('#call-duration');if(el){const seconds=Math.floor((performance.now()-connectedAt)/1000);el.textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}},1000);}
      else if(connection.connectionState==='failed')void hangup('failed');
      else if(connection.connectionState==='disconnected'){clearTimeout(disconnectTimer);disconnectTimer=setTimeout(()=>void hangup('disconnected'),15000);}
    };
  }
  function heartbeat() {clearInterval(heartbeatTimer);heartbeatTimer=setInterval(()=>{if(active&&registered){const id=active.id;void post(`/${id}/heartbeat`).catch(error=>{if(active?.id===id&&[401,409].includes(error.status))void hangup('disconnected');});}},15000);}
  function connectionDeadline(){clearTimeout(connectTimer);connectTimer=setTimeout(()=>{if(phase!=='connected')void hangup('failed');},30000);}
  async function description(call,type,description) {
    return encryption.encryptEnvelope({kind:'call-description',callId:call.id,senderId:user.id,type,description},[call.caller,call.callee]);
  }
  async function readDescription(call,type,ciphertext,sender,serverTime) {
    const value=await encryption.decryptEnvelope(ciphertext,sender,{kind:'call-description',callId:call.id,senderId:sender.id,type},serverTime);
    if(value.description?.type!==type||typeof value.description.sdp!=='string'||value.description.sdp.length>24000||/\r?\nm=video\s/.test(value.description.sdp))throw Error('invalid_call_description');
    return value.description;
  }
  async function receiveSignals(call,serverTime) {
    for(const message of call.signals??[]){
      if(message.senderId===user.id||seenSignals.has(message.id))continue;
      const sender=call.callerId===message.senderId?call.caller:call.callee;
      const value=await encryption.decryptEnvelope(message.ciphertext,sender,{kind:'call-signal',id:message.id,callId:call.id,senderId:sender.id,type:'ice'},serverTime);
      if(active?.id!==call.id||!pc)return;
      if(!Array.isArray(value.candidates)||value.candidates.length>20)throw Error('invalid_call_signal');
      for(const candidate of value.candidates){if(typeof candidate.candidate!=='string'||candidate.candidate.length>4096)throw Error('invalid_call_signal');if(pc?.remoteDescription)await pc.addIceCandidate(candidate);else remoteCandidates.push(candidate);}
      seenSignals.add(message.id);
    }
    if(pc?.remoteDescription){for(const candidate of remoteCandidates.splice(0))await pc.addIceCandidate(candidate);}
  }
  async function dial(chat) {
    if(working||['incoming','dialing','connecting','connected'].includes(phase))return;
    if(!supported()){toast(t('unsupported'));return;}
    working=true;const generation=++actionGeneration;clearTimeout(closeTimer);release();
    const callee=chat.members.find(member=>member.id!==user.id&&member.status==='accepted');
    active={id:crypto.randomUUID(),chatId:chat.id,callerId:user.id,calleeId:callee.id,caller:encryption.ownIdentity(),callee};active.caller.name=getState().user.personalName;
    phase='dialing';render();
    try {
      const captured=await microphone();if(generation!==actionGeneration){captured.getTracks().forEach(track=>track.stop());return;}stream=captured;await makePeer();if(generation!==actionGeneration)return;const call=active;
      const offer=await pc.createOffer();await pc.setLocalDescription(offer);
      const ciphertext=await description(call,'offer',{type:'offer',sdp:pc.localDescription.sdp});
      if(generation!==actionGeneration)return;
      const result=await post('',{id:call.id,chatId:chat.id,offer:ciphertext});if(generation!==actionGeneration){await post(`/${call.id}/end`).catch(()=>{});return;}active=result.call;registered=true;heartbeat();await flush();
    }catch(error){if(generation===actionGeneration){report(error);finish('failed');}}finally{working=false;render();}
  }
  async function accept() {
    if(working||phase!=='incoming')return;working=true;const generation=++actionGeneration;stopRing();render();
    try {
      const captured=await microphone();if(generation!==actionGeneration){captured.getTracks().forEach(track=>track.stop());return;}stream=captured;await makePeer();if(generation!==actionGeneration)return;
      const result=await request(`?device=${deviceId}`),call=result.calls.find(c=>c.id===active?.id);
      if(!call||call.status!=='ringing')throw Error('call_ended');active=call;
      await pc.setRemoteDescription(await readDescription(call,'offer',call.offer,call.caller,result.serverTime));
      await receiveSignals(call,result.serverTime);
      const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
      const ciphertext=await description(call,'answer',{type:'answer',sdp:pc.localDescription.sdp});
      if(generation!==actionGeneration)return;
      const answered=await post(`/${call.id}/answer`,{answer:ciphertext});if(generation!==actionGeneration){await post(`/${call.id}/end`).catch(()=>{});return;}active=answered.call;registered=true;phase='connecting';heartbeat();connectionDeadline();await flush();
    }catch(error){if(generation===actionGeneration){report(error);await hangup('failed');}}finally{working=false;render();}
  }
  async function hangup(reason='ended') {
    actionGeneration++;const call=active;registered=false;finish(reason);
    if(call)await post(`/${call.id}/end`,{reason}).catch(()=>{});
  }
  async function poll() {
    if(polling||working||!user)return;polling=true;const generation=version,polledId=active?.id;let processing=false;
    try {
      const result=await request(`?device=${deviceId}`);if(generation!==version||working||active?.id!==polledId)return;
      processing=true;
      if(!active||!['incoming','dialing','connecting','connected'].includes(phase)) {
        const incoming=result.calls.find(call=>call.status==='ringing'&&call.calleeId===user.id);
        if(incoming){clearTimeout(closeTimer);active=incoming;phase='incoming';ring();if(!ringTimer)ringTimer=setInterval(ring,2500);render();}
        else {
          const abandoned=result.calls.find(call=>['ringing','accepted'].includes(call.status));
          if(abandoned)await post(`/${abandoned.id}/end`);
        }
        return;
      }
      const call=result.calls.find(c=>c.id===active.id);
      if(!call){finish('ended');return;}active=call;
      if(call.status==='ended'){finish(call.reason);return;}
      if(phase==='incoming'){render();return;}
      if(call.status==='accepted'&&call.callerId===user.id&&!pc.remoteDescription){phase='connecting';render();await pc.setRemoteDescription(await readDescription(call,'answer',call.answer,call.callee,result.serverTime));connectionDeadline();}
      if(pc)await receiveSignals(call,result.serverTime);
    }catch(error){if(processing&&active?.id===polledId&&['dialing','connecting','connected'].includes(phase)){await hangup('failed');}if(error.status===401)void stop();}
    finally{polling=false;}
  }
  panel.addEventListener('click',event=>{const action=event.target.closest('[data-call]')?.dataset.call;if(action==='accept')void accept();else if(action==='end')void hangup();else if(action==='close'){clearTimeout(closeTimer);active=null;phase='idle';render();}else if(action==='mute'){muted=!muted;stream?.getAudioTracks().forEach(track=>track.enabled=!muted);render();}else if(action==='sound')void remoteAudio.play().then(()=>{needsSound=false;render();}).catch(()=>toast(t('error')));});
  async function stop(){version++;actionGeneration++;clearInterval(pollTimer);clearTimeout(closeTimer);if(active&&['dialing','incoming','connecting','connected'].includes(phase))await hangup();release();ringContext?.close().catch(()=>{});ringContext=null;active=null;user=null;phase='idle';render();}
  window.addEventListener('pagehide',()=>{actionGeneration++;if(active&&user&&['incoming','dialing','connecting','connected'].includes(phase))void fetch(`/api/mvp/calls/${active.id}/end`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({deviceId}),keepalive:true}).catch(()=>{});release();active=null;phase='idle';});
  return { button:chat=>chat.type==='direct'&&chat.ready&&!chat.blocked?`<button class="button secondary" data-audio-call="${e(chat.id)}" ${!supported()||!encryption.unlocked()||working||['incoming','dialing','connecting','connected'].includes(phase)?'disabled':''}>☎ ${t('call')}</button>`:'',dial,stop,start(account){user=account;version++;clearInterval(pollTimer);pollTimer=setInterval(poll,2000);void poll();} };
}
