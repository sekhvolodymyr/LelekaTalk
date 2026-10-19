import * as encryption from '/crypto.js';

export function createStudio({api,getState,escapeHTML:e,toast}){
  const labels={uk:{loading:'Готуємо запис…',title:'Моя студія',intro:'Твій момент. Твоя розмова. Наживо.',start:'Почати ефір',end:'Завершити ефір',placeholder:'Про що твій ефір?',record:'Підготувати локальний запис',privacy:'Ефіри відкриті всім користувачам LelekaTalk. Без архіву: відео не зберігається на сервері. Коментарі доступні лише під час ефіру.',recordHint:'Запис лише в пам’яті цієї вкладки, до 128 МБ. Завантаж або видали його перед закриттям.',empty:'Почни щось справжнє',emptyHint:'Зараз ефірів немає. Стань першим, хто вийде наживо.',watch:'Дивитися',next:'Наступний ефір',previous:'Попередній ефір',swipe:'Свайпай вгору, щоб змінити ефір',like:'Подобається',share:'Поширити',comment:'Написати коментар…',send:'Надіслати',mute:'Вимкнути мікрофон',unmute:'Увімкнути мікрофон',camera:'Приховати відео',cameraOn:'Показати відео',sound:'Увімкнути звук',refresh:'Оновити ефіри',download:'Завантажити відео',discard:'Видалити локальний запис',saved:'Локальний запис готовий',recording:'Запис на пристрої',recordLimit:'Запис досяг 128 МБ і зупинений. Ефір продовжується; завантаж локальний файл.',viewers:'глядачів',live:'НАЖИВО',connecting:'Підключаємо відео…',ended:'Ефір завершено. Відеоархіву немає.',copied:'Посилання на ефір скопійовано',confirm:'Завершити поточний ефір?',discardConfirm:'Видалити локальний запис без завантаження?',leave:'Ефір триває. Завершити його перед переходом?',locked:'Спочатку розблокуй приватні ключі для захищеного підключення.',support:'Браузер не підтримує камеру та WebRTC.',permission:'Дозволь доступ до камери й мікрофона.',failed:'Не вдалося підключити відео. Спробуй іншу мережу.',error:'Не вдалося виконати дію. Спробуй ще раз.',full:'В ефірі вже 5 глядачів. Спробуй пізніше.',other:'Цей акаунт уже веде ефір в іншій вкладці.',unavailableRecord:'Запис у цьому браузері недоступний. Можна провести ефір без запису.',cancel:'Скасувати',limit:'До 5 глядачів · тримай вкладку відкритою',watching:'Переглядаєш ефір',noVideo:'Відео приховане',comments:'Коментарі',host:'Твій ефір'},en:{loading:'Preparing recording…',title:'My studio',intro:'Your moment. Your conversation. Live.',start:'Go live',end:'End live',placeholder:'What is your live about?',record:'Prepare a local recording',privacy:'Live streams are open to all LelekaTalk users. No archive: video is never stored on the server. Comments exist only during the live.',recordHint:'Recording stays only in this tab’s memory, up to 128 MB. Download or discard it before closing.',empty:'Start something real',emptyHint:'No one is live yet. Be the first to start.',watch:'Watch',next:'Next live',previous:'Previous live',swipe:'Swipe up to switch live streams',like:'Like',share:'Share',comment:'Write a comment…',send:'Send',mute:'Mute microphone',unmute:'Unmute microphone',camera:'Hide video',cameraOn:'Show video',sound:'Enable sound',refresh:'Refresh live streams',download:'Download video',discard:'Discard local recording',saved:'Local recording ready',recording:'Recording on device',recordLimit:'Recording reached 128 MB and stopped. The live continues; download your local file.',viewers:'viewers',live:'LIVE',connecting:'Connecting video…',ended:'Live ended. No video archive is available.',copied:'Live link copied',confirm:'End the current live?',discardConfirm:'Discard this recording without downloading?',leave:'You are live. End your broadcast before leaving?',locked:'Unlock your private keys first for a protected connection.',support:'This browser does not support camera and WebRTC.',permission:'Allow camera and microphone access.',failed:'Video could not connect. Try another network.',error:'Action failed. Please try again.',full:'This live already has 5 viewers. Try again later.',other:'This account is broadcasting in another tab.',unavailableRecord:'Recording is not supported here. You can go live without recording.',cancel:'Cancel',limit:'Up to 5 viewers · keep this tab open',watching:'Watching live',noVideo:'Video is hidden',comments:'Comments',host:'Your live'}};
  const t=key=>labels[getState().language==='en'?'en':'uk'][key]??key;
  const deviceId=crypto.randomUUID(),root=document.createElement('section');root.className='studio-page';
  const header=document.createElement('header');header.className='studio-heading';
  const setup=document.createElement('div');setup.className='studio-setup';
  const layout=document.createElement('div');layout.className='studio-layout';
  const stage=document.createElement('div');stage.className='studio-stage';stage.tabIndex=0;stage.setAttribute('role','region');
  const video=document.createElement('video');video.id='studio-video';video.autoplay=true;video.playsInline=true;
  const overlay=document.createElement('div');overlay.className='studio-overlay';
  const list=document.createElement('aside');list.className='studio-live-list';
  const recordingBox=document.createElement('div');recordingBox.className='studio-recording-box';
  stage.append(video,overlay);layout.append(stage,list);root.append(header,setup,recordingBox,layout);
  let user,streams=[],active=null,viewerId=null,hostRoom=null,capture=null,config=null,working=false,polling=false,pollTimer,heartbeatTimer,generation=0,action=0,muted=false,cameraOff=false,soundBlocked=false,status='',titleDraft='',commentDraft='',recordWanted=true;
  const peers=new Map();let recordingFinished=Promise.resolve(),recorder=null,chunks=[],recordBytes=0,recordBlob=null,recordName='',recordPending=false,downloadUrl=null,comments=[],lastSwitch=0;
  const request=(path='',options)=>api(`mvp/studio${path}`,options);
  const post=(path,body={})=>request(path,{method:'POST',body:{...body,deviceId}});
  const supported=()=>window.isSecureContext&&'RTCPeerConnection'in window&&navigator.mediaDevices?.getUserMedia;
  const isHost=()=>Boolean(hostRoom&&active?.id===hostRoom);
  const visible=()=>getState().view==='studio'&&getState().user;
  function refreshUi(){if(!visible())return;render();}
  const button=(name,label,extra='')=>`<button type="button" class="button secondary" data-studio="${name}" ${extra} ${working?'disabled':''}>${e(t(label))}</button>`;
  function render(){
    const focused=root.contains(document.activeElement)?document.activeElement:null;
    const focusId=focused?.id,selection=focused?.selectionStart;
    const previousChat=overlay.querySelector('.studio-comments');
    const chatScroll=previousChat?.scrollTop,atBottom=!previousChat||previousChat.scrollHeight-previousChat.clientHeight-previousChat.scrollTop<30;
    header.innerHTML=`<div><span class="studio-eyebrow">LELEKATALK LIVE</span><h1>${t('title')}</h1><p>${t('intro')}</p></div><div class="studio-heading-actions">${active&&!isHost()?button('create','start'):''}${button('refresh','refresh')}</div>`;
    setup.hidden=Boolean(active);
    setup.innerHTML=`<form id="studio-start-form"><label class="sr-only" for="studio-title">${t('placeholder')}</label><input id="studio-title" name="title" maxlength="80" placeholder="${t('placeholder')}" value="${e(titleDraft)}" required><button class="button primary" ${working||!supported()||!encryption.unlocked()?'disabled':''}>● ${t('start')}</button><label class="checkbox"><input type="checkbox" name="record" ${recordWanted?'checked':''} ${typeof MediaRecorder==='undefined'?'disabled':''}>${t('record')}</label></form><p>${t('privacy')}</p><small>${t('recordHint')}</small>`;
    recordingBox.hidden=!recordBlob&&!recordPending;
    recordingBox.innerHTML=recordBlob?`<strong>${t('saved')}</strong><span>${(recordBlob.size/1048576).toFixed(1)} MB</span>${button('download','download')}${button('discard','discard')}`:`<p>${t('loading')}</p>`;
    stage.setAttribute('aria-label',active?.title??t('title'));
    video.muted=isHost();video.classList.toggle('studio-self',isHost());
    overlay.innerHTML=active?`<div class="studio-topline"><span class="studio-live-badge">● ${t('live')}</span><span>${active.viewerCount}/${active.viewerLimit} ${t('viewers')}</span></div><div class="studio-stage-status" role="status">${e(status)}${cameraOff?`<span>${t('noVideo')}</span>`:''}</div><div class="studio-rail"><button data-studio="like" aria-label="${t('like')}" aria-pressed="${active.liked}" ${working?'disabled':''}><span>♥</span><small>${active.likes}</small></button><button data-studio="comment-focus" aria-label="${t('comments')}"><svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M20 11a8 8 0 0 1-8 8H5l-3 3v-11a9 9 0 0 1 18 0Z"/></svg><small>${comments.length}</small></button><button data-studio="share" aria-label="${t('share')}"><span>↗</span><small>${active.shares}</small></button>${!isHost()?`<button data-studio="previous" aria-label="${t('previous')}">↑</button><button data-studio="next" aria-label="${t('next')}">↓</button>`:''}</div><div class="studio-lower"><div class="studio-author"><span>${e(Array.from(active.author.name??'L')[0])}</span><div><strong>${e(active.author.name)}</strong><h2>${e(active.title)}</h2></div></div><div class="studio-comments" aria-label="${t('comments')}">${comments.map(c=>`<p><strong>${e(c.authorName)}</strong> ${e(c.text)}</p>`).join('')}</div><form id="studio-comment-form"><label class="sr-only" for="studio-comment">${t('comment')}</label><input id="studio-comment" maxlength="300" name="text" value="${e(commentDraft)}" placeholder="${t('comment')}" required><button aria-label="${t('send')}" ${working?'disabled':''}>↑</button></form>${isHost()?`<div class="studio-host-controls">${button('mute',muted?'unmute':'mute')}${button('camera',cameraOff?'cameraOn':'camera')}${button('end','end')}${recorder?.state==='recording'?`<small>● ${t('recording')}</small>`:''}</div>`:`${soundBlocked?button('sound','sound'):''}<small class="studio-swipe-hint">${t('swipe')}</small>`}</div>`:`<div class="studio-empty"><span>✳</span><h2>${t('empty')}</h2><p>${e(status||t('emptyHint'))}</p></div>`;
    list.innerHTML=`<p class="studio-list-label">${t('limit')}</p>${streams.map(stream=>`<button class="studio-stream-item ${active?.id===stream.id?'selected':''}" data-studio="watch" data-id="${stream.id}" ${working?'disabled':''}><span class="studio-stream-avatar">${e(Array.from(stream.author.name??'L')[0])}</span><span><strong>${e(stream.title)}</strong><small>${e(stream.author.name)} · ${stream.viewerCount} ${t('viewers')}</small></span><span class="studio-stream-dot">●</span></button>`).join('')}`;
    bindForms();const chat=overlay.querySelector('.studio-comments');if(chat)chat.scrollTop=atBottom?chat.scrollHeight:chatScroll; if(focusId){const field=root.querySelector('#'+focusId);if(field){field.focus({preventScroll:true});if(typeof selection==='number')field.setSelectionRange(selection,selection);}}
  }
  function report(error){const key=error.code==='stream_full'?'full':['already_live','host_other_device'].includes(error.code)?'other':['NotAllowedError','NotFoundError','NotReadableError'].includes(error.name)?'permission':!encryption.unlocked()?'locked':'error';toast(t(key));}
  function closePeer(id){const peer=peers.get(id);if(!peer)return;clearTimeout(peer.deadline);peer.pc.onicecandidate=null;peer.pc.ontrack=null;peer.pc.onconnectionstatechange=null;peer.pc.close();peers.delete(id);}
  function closePeers(){for(const id of [...peers.keys()])closePeer(id);video.pause();video.srcObject=null;}
  async function sendSignal(peer,type,content){
    const room=active,owner=generation,id=crypto.randomUUID();if(!room||peer.roomId!==room.id)return;
    const ciphertext=await encryption.encryptEnvelope({kind:'studio-signal',id,streamId:room.id,viewerId:peer.id,senderId:user.id,type,...content},[room.author,peer.person]);
    if(owner!==generation||active?.id!==room.id||peers.get(peer.id)!==peer)return;
    await post(`/${room.id}/signal`,{viewerId:peer.id,id,type,ciphertext});
  }
  async function flush(peer){if(peer.flushing||!peer.candidates.length||peer.closed)return;peer.flushing=true;try{while(peer.candidates.length&&peers.get(peer.id)===peer)await sendSignal(peer,'ice',{candidates:peer.candidates.splice(0,20)});}catch{if(peers.get(peer.id)===peer){status=t('failed');refreshUi();}}finally{peer.flushing=false;}}
  function makePeer(id,person,hosting){
    const pc=new RTCPeerConnection({iceServers:config.iceServers}),peer={id,person,pc,roomId:active.id,seen:new Set(),candidates:[],remoteCandidates:[],hosting,flushing:false};peers.set(id,peer);
    if(hosting)capture.getTracks().forEach(track=>pc.addTrack(track,capture));
    pc.onicecandidate=event=>{if(event.candidate&&peers.get(id)===peer){peer.candidates.push(event.candidate.toJSON());void flush(peer);}};
    pc.ontrack=event=>{if(peers.get(id)!==peer||hosting)return;if(event.streams[0]){if(video.srcObject!==event.streams[0])video.srcObject=event.streams[0];}else{video.srcObject??=new MediaStream();video.srcObject.addTrack(event.track);}void video.play().then(()=>{soundBlocked=false;refreshUi();}).catch(()=>{if(peers.get(id)===peer&&video.paused){soundBlocked=true;refreshUi();}});};
    peer.deadline=setTimeout(()=>{if(peers.get(id)===peer&&pc.connectionState!=='connected'){status=t('failed');refreshUi();}},35000);
    pc.onconnectionstatechange=()=>{if(peers.get(id)!==peer)return;if(pc.connectionState==='connected'){clearTimeout(peer.deadline);status='';refreshUi();}else if(pc.connectionState==='failed'){status=t('failed');refreshUi();}};
    return peer;
  }
  async function processSignals(peer,signals,serverTime){
    for(const message of signals){
      if(message.senderId===user.id||peer.seen.has(message.id))continue;
      const sender=peer.hosting?peer.person:active.author;
      const value=await encryption.decryptEnvelope(message.ciphertext,sender,{kind:'studio-signal',id:message.id,streamId:peer.roomId,viewerId:peer.id,senderId:sender.id,type:message.type},serverTime);
      if(peers.get(peer.id)!==peer||active?.id!==peer.roomId)return;
      if(message.type==='ice'){
        if(!Array.isArray(value.candidates)||value.candidates.length>20)throw Error('invalid_signal');
        for(const candidate of value.candidates){if(typeof candidate.candidate!=='string'||candidate.candidate.length>4096)throw Error('invalid_signal');if(peer.pc.remoteDescription)await peer.pc.addIceCandidate(candidate);else peer.remoteCandidates.push(candidate);}
      }else{
        const expected=peer.hosting?'answer':'offer';if(message.type!==expected||value.description?.type!==expected||typeof value.description.sdp!=='string'||value.description.sdp.length>24000)throw Error('invalid_signal');
        if(!/(?:^|\r?\n)m=video /.test(value.description.sdp))throw Error('invalid_video');await peer.pc.setRemoteDescription(value.description);
        if(!peer.hosting){const answer=await peer.pc.createAnswer();await peer.pc.setLocalDescription(answer);await sendSignal(peer,'answer',{description:{type:'answer',sdp:peer.pc.localDescription.sdp}});}
        for(const candidate of peer.remoteCandidates.splice(0))await peer.pc.addIceCandidate(candidate);
      }
      peer.seen.add(message.id);
    }
  }
  async function updateConnection(result){
    if(!active||active.id!==result.stream.id)return;active=result.stream;comments=result.comments;
    if(isHost()){
      const ids=new Set(result.viewers.map(v=>v.id));for(const id of peers.keys())if(!ids.has(id))closePeer(id);
      for(const viewer of result.viewers){if(!isHost()||active?.id!==result.stream.id||!capture)return;let peer=peers.get(viewer.id);if(!peer){peer=makePeer(viewer.id,viewer.person,true);const offer=await peer.pc.createOffer();if(peers.get(peer.id)!==peer)return;await peer.pc.setLocalDescription(offer);await sendSignal(peer,'offer',{description:{type:'offer',sdp:peer.pc.localDescription.sdp}});}await processSignals(peer,viewer.signals,result.serverTime);}
    }else{
      const viewer=result.viewers.find(v=>v.id===viewerId);if(!viewer){await leaveViewer();status=t('ended');return;}
      const peer=peers.get(viewerId)??makePeer(viewerId,active.author,false);await processSignals(peer,viewer.signals,result.serverTime);
    }
  }
  async function loadStreams(){const owner=generation;const result=await request(`?device=${deviceId}`);if(owner===generation){streams=result.streams;refreshUi();}}
  function heartbeat(){clearInterval(heartbeatTimer);heartbeatTimer=setInterval(()=>{if(active){const id=active.id;void post(`/${id}/heartbeat`,{viewerId}).catch(error=>{if(active?.id===id&&[401,403,404].includes(error.status)){if(isHost())void end(false);else void leaveViewer();status=t('ended');refreshUi();}});}},15000);}
  async function poll(){
    if(polling||working||!user||!visible()&&!hostRoom)return;polling=true;const owner=generation,id=active?.id,version=action;
    try{await loadStreams();if(owner!==generation||version!==action||!active||active.id!==id)return;const result=await request(`/${id}?device=${deviceId}${viewerId?`&viewerId=${viewerId}`:''}`);if(owner!==generation||version!==action||active?.id!==id||working)return;await updateConnection(result);refreshUi();}
    catch(error){if(owner===generation&&version===action&&active?.id===id){if([401,403,404].includes(error.status)){if(isHost())await end(false);else await leaveViewer();status=t('ended');}else if(!error.status){status=t('failed');}refreshUi();}}
    finally{polling=false;}
  }
  async function leaveViewer(){action++;const room=active,id=viewerId;clearInterval(heartbeatTimer);closePeers();viewerId=null;if(!hostRoom)active=null;comments=[];commentDraft='';if(room&&id)await post(`/${room.id}/leave`,{viewerId:id}).catch(()=>{});}
  async function watch(id){
    if(working||hostRoom||active?.id===id)return;if(!encryption.unlocked()){toast(t('locked'));return;}
    working=true;await leaveViewer();const version=action,owner=generation;
    try{config??=await api('mvp/calls/config');const stream=streams.find(s=>s.id===id);if(!stream)throw Error('ended');const joiningId=crypto.randomUUID();const result=await post(`/${id}/join`,{viewerId:joiningId});if(owner!==generation||version!==action){await post(`/${id}/leave`,{viewerId:joiningId}).catch(()=>{});return;}active=result.stream;viewerId=joiningId;status=t('connecting');comments=[];heartbeat();}
    catch(error){if(owner===generation)report(error);}finally{if(owner===generation){working=false;refreshUi();void poll();}}
  }
  function discardRecord(){if(downloadUrl)URL.revokeObjectURL(downloadUrl);downloadUrl=null;recordBlob=null;chunks=[];recordBytes=0;recordName='';refreshUi();}
  function startRecording(){
    if(!recordWanted)return;if(typeof MediaRecorder==='undefined'){toast(t('unavailableRecord'));return;}
    const mime=['video/webm;codecs=vp8,opus','video/mp4','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));
    let finished;try{chunks=[];recordBytes=0;recordName=`LelekaTalk-live-${new Date().toISOString().replace(/[:.]/g,'-')}`;recorder=new MediaRecorder(capture,{...(mime?{mimeType:mime}:{}),videoBitsPerSecond:1200000,audioBitsPerSecond:64000});
      const current=recorder;recordingFinished=new Promise(resolve=>finished=resolve);current.ondataavailable=event=>{if(event.data.size){chunks.push(event.data);recordBytes+=event.data.size;if(recordBytes>=128*1048576&&current.state==='recording'){current.stop();toast(t('recordLimit'));}}};
      current.onstop=()=>{recordBlob=chunks.length?new Blob(chunks,{type:current.mimeType}):null;chunks=[];recordPending=false;if(recorder===current)recorder=null;refreshUi();finished();};
      current.onerror=()=>{toast(t('unavailableRecord'));if(current.state!=='inactive')current.stop();};current.start(1000);
    }catch{finished?.();recorder=null;toast(t('unavailableRecord'));}
  }
  async function stopRecording(){const current=recorder;if(current&&current.state!=='inactive'){recordPending=true;current.stop();}await recordingFinished;}
  async function goLive(){
    if(working||hostRoom)return;if(!supported()){toast(t('support'));return;}if(!encryption.unlocked()){toast(t('locked'));return;}
    if(recordBlob){toast(t('recordHint'));return;}
    working=true;await leaveViewer();const owner=generation,version=action;refreshUi();let roomId;
    try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:960},frameRate:{ideal:24,max:30}},audio:{echoCancellation:true,noiseSuppression:true}});if(owner!==generation||version!==action){stream.getTracks().forEach(t=>t.stop());return;}capture=stream;config??=await api('mvp/calls/config');if(owner!==generation||version!==action){stream.getTracks().forEach(track=>track.stop());if(capture===stream)capture=null;return;}
      roomId=crypto.randomUUID();const result=await post('',{id:roomId,title:titleDraft});if(owner!==generation||version!==action){await post(`/${roomId}/end`).catch(()=>{});stream.getTracks().forEach(track=>track.stop());if(capture===stream)capture=null;return;}active=result.stream;hostRoom=roomId;video.muted=true;video.srcObject=capture;await video.play().catch(()=>{});if(owner!==generation||version!==action||hostRoom!==roomId)return;status='';startRecording();heartbeat();await loadStreams();
    }catch(error){capture?.getTracks().forEach(t=>t.stop());capture=null;hostRoom=null;active=null;if(roomId)await post(`/${roomId}/end`).catch(()=>{});if(owner===generation)report(error);}
    finally{if(owner===generation){working=false;refreshUi();}}
  }
  async function end(ask=true){
    if(!hostRoom)return;if(ask&&!confirm(t('confirm')))return;action++;const id=hostRoom;hostRoom=null;clearInterval(heartbeatTimer);closePeers();await stopRecording();capture?.getTracks().forEach(track=>track.stop());capture=null;active=null;viewerId=null;comments=[];muted=false;cameraOff=false;status=t('ended');refreshUi();await post(`/${id}/end`).catch(()=>{});await loadStreams().catch(()=>{});
  }
  function switchStream(delta){if(hostRoom||working||Date.now()-lastSwitch<800||streams.length<2)return;lastSwitch=Date.now();const index=streams.findIndex(stream=>stream.id===active?.id);void watch(streams[(index+delta+streams.length)%streams.length].id);}
  let pointerY=null;
  stage.addEventListener('touchstart',event=>{if(event.target.closest('input,button,.studio-comments'))return;pointerY=event.touches[0].clientY;},{passive:true});
  stage.addEventListener('touchend',event=>{if(pointerY===null)return;const delta=pointerY-event.changedTouches[0].clientY;pointerY=null;if(Math.abs(delta)>60)switchStream(delta>0?1:-1);},{passive:true});
  stage.addEventListener('wheel',event=>{if(event.target.closest('input,.studio-comments')||hostRoom)return;if(Math.abs(event.deltaY)>35){event.preventDefault();switchStream(event.deltaY>0?1:-1);}},{passive:false});
  stage.addEventListener('keydown',event=>{if(event.target.closest('input,textarea'))return;if(['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();switchStream(event.key==='ArrowDown'?1:-1);}});
  root.addEventListener('click',event=>{
    const target=event.target.closest('[data-studio]');if(!target||target.disabled)return;const value=target.dataset.studio;
    if(value==='create')void leaveViewer().then(refreshUi);if(value==='watch')void watch(target.dataset.id);if(value==='refresh')void loadStreams().catch(report);if(value==='end')void end();if(value==='next')switchStream(1);if(value==='previous')switchStream(-1);
    if(value==='like'&&active){const room=active;void post(`/${room.id}/like`,{viewerId,liked:!room.liked}).then(result=>{if(active?.id===room.id){active=result.stream;refreshUi();}}).catch(report);}
    if(value==='share'&&active){const room=active,url=new URL('/',location.origin);url.searchParams.set('live',room.id);void navigator.clipboard.writeText(url.href).then(()=>{toast(t('copied'));return post(`/${room.id}/share`,{viewerId});}).then(result=>{if(active?.id===room.id){active=result.stream;refreshUi();}}).catch(report);}
    if(value==='comment-focus')root.querySelector('#studio-comment')?.focus();
    if(value==='mute'&&isHost()){muted=!muted;capture.getAudioTracks().forEach(track=>track.enabled=!muted);refreshUi();}
    if(value==='camera'&&isHost()){cameraOff=!cameraOff;capture.getVideoTracks().forEach(track=>track.enabled=!cameraOff);refreshUi();}
    if(value==='sound')void video.play().then(()=>{soundBlocked=false;refreshUi();}).catch(report);
    if(value==='download'&&recordBlob){downloadUrl??=URL.createObjectURL(recordBlob);const link=document.createElement('a');link.href=downloadUrl;link.download=recordName+(recordBlob.type.includes('mp4')?'.mp4':'.webm');link.click();}
    if(value==='discard'&&confirm(t('discardConfirm')))discardRecord();
  });
  function bindForms(){
    setup.querySelector('#studio-title')?.addEventListener('input',event=>titleDraft=event.target.value);
    setup.querySelector('[name="record"]')?.addEventListener('change',event=>recordWanted=event.target.checked);
    setup.querySelector('form')?.addEventListener('submit',event=>{event.preventDefault();void goLive();});
    overlay.querySelector('#studio-comment')?.addEventListener('input',event=>commentDraft=event.target.value);
    overlay.querySelector('#studio-comment-form')?.addEventListener('submit',event=>{event.preventDefault();if(!active||!commentDraft.trim())return;const room=active,text=commentDraft;void post(`/${room.id}/comment`,{viewerId,id:crypto.randomUUID(),text}).then(()=>{if(active?.id===room.id){commentDraft='';void poll();}}).catch(report);});
  }
  window.addEventListener('beforeunload',event=>{if(hostRoom||recordBlob||recorder){event.preventDefault();event.returnValue='';}});
  window.addEventListener('pagehide',()=>{const id=hostRoom??active?.id;if(id)void fetch(`/api/mvp/studio/${id}/${hostRoom?'end':'leave'}`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({deviceId,viewerId}),keepalive:true}).catch(()=>{});capture?.getTracks().forEach(track=>track.stop());closePeers();});
  return {render:()=>'<div id="studio-mount"></div>',beforeRender(){root.remove();},bind(){const mount=document.querySelector('#studio-mount');if(mount){mount.append(root);render();void poll();}},async beforeLeave(logout=false){if(logout&&(recordBlob||recorder)&&!confirm(t('recordHint')))return false; action++;if(hostRoom){if(!confirm(t('leave')))return false;await end(false);}else if(active)await leaveViewer();return true;},async start(account){generation++;user=account;clearInterval(pollTimer);await loadStreams().catch(report);pollTimer=setInterval(()=>void poll(),2000);const id=new URL(location.href).searchParams.get('live');if(id){getState().view='studio';if(streams.some(s=>s.id===id))await watch(id);else status=t('ended');}},async stop(){if(hostRoom)await end(false);else await leaveViewer();generation++;clearInterval(pollTimer);clearInterval(heartbeatTimer);capture?.getTracks().forEach(t=>t.stop());capture=null;await stopRecording();discardRecord();user=null;streams=[];active=null;hostRoom=null;root.remove();}};
}
