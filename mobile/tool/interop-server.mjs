// Synthetic accounts only. Never connects to production or reads .env files.
import {createApp} from '../../phase-one/server.mjs';
import {createRequire} from 'node:module';
const pgp=createRequire(new URL('../../phase-one/package.json',import.meta.url))('openpgp');
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {createInterface} from 'node:readline';

const directory=await mkdtemp(join(tmpdir(),'leleka-mobile-'));
const server=createApp({dataDirectory:directory,pushService:null});
server.listen(0,'127.0.0.1');await once(server,'listening');
const origin=`http://127.0.0.1:${server.address().port}`;
async function api(path,body,cookie,method=body?'POST':'GET'){
  const response=await fetch(`${origin}/api/${path}`,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();if(!response.ok)throw Error(JSON.stringify(data));
  return {data,cookie:response.headers.get('set-cookie')?.split(';')[0]??cookie};
}
async function account(username){
  const {data,cookie}=await api('register',{email:`${username}@example.test`,username,name:username,password:'test-password-123456',ageConfirmed:true});
  const code='11223344-55667788-99AABBCC-DDEEFF00-11223344-55667788-99AABBCC-DDEEFF00';
  const key=await pgp.generateKey({type:'ecc',curve:'curve25519',userIDs:[{name:`@${username}`}],passphrase:code,date:new Date(Date.now()-5000)});
  const vault=(await api('mvp/crypto',{publicKey:key.publicKey,encryptedPrivateKey:key.privateKey},cookie)).data.vault;
  const privateKey=await pgp.decryptKey({privateKey:await pgp.readPrivateKey({armoredKey:key.privateKey}),passphrase:code});
  return {user:data.user,cookie,code,vault,privateKey};
}
try{
  const alice=await account('mobile_alice'),bob=await account('mobile_bob');
  let chat=(await api('mvp/chats',{type:'direct',userId:bob.user.id},alice.cookie)).data.chat;
  chat=(await api(`mvp/chats/${chat.id}/accept`,{},bob.cookie)).data.chat;
  const id=randomUUID(),payload={kind:'message',id,chatId:chat.id,senderId:alice.user.id,text:'Привіт із Web 👋'};
  const encryptionKeys=await Promise.all([alice,bob].map(a=>pgp.readKey({armoredKey:a.vault.publicKey})));
  const ciphertext=await pgp.encrypt({message:await pgp.createMessage({text:JSON.stringify(payload)}),encryptionKeys,signingKeys:alice.privateKey,date:new Date(Date.now()-3000)});
  await api(`mvp/chats/${chat.id}/messages`,{id,ciphertext,revision:chat.revision},alice.cookie);
  console.log(JSON.stringify({origin,user:bob.user,code:bob.code,chat,alice:{id:alice.user.id,publicKey:alice.vault.publicKey,fingerprint:alice.vault.fingerprint},payload}));
  for await(const line of createInterface({input:process.stdin})){
    const command=JSON.parse(line);if(command.action==='exit')break;
    try{
      if(command.action==='verify'){
        const result=await pgp.decrypt({message:await pgp.readMessage({armoredMessage:command.ciphertext}),decryptionKeys:alice.privateKey,verificationKeys:await pgp.readKey({armoredKey:bob.vault.publicKey}),expectSigned:true});
        await result.signatures[0].verified;console.log(JSON.stringify({payload:JSON.parse(result.data)}));
      }else if(command.action==='verify-new-key'){
        const key=await pgp.readKey({armoredKey:command.publicKey});await key.verifyPrimaryKey();
        const privateKey=await pgp.decryptKey({privateKey:await pgp.readPrivateKey({armoredKey:command.privateKey}),passphrase:command.code});
        const result=await pgp.decrypt({message:await pgp.readMessage({armoredMessage:command.ciphertext}),decryptionKeys:privateKey,verificationKeys:key,expectSigned:true});
        await result.signatures[0].verified;console.log(JSON.stringify({payload:JSON.parse(result.data)}));
      }else if(command.action==='read'){
        const result=(await api(`mvp/chats/${chat.id}/messages`,null,alice.cookie)).data;
        console.log(JSON.stringify({messages:result.messages}));
      }
    }catch(error){console.log(JSON.stringify({error:error.message}));}
  }
}finally{
  server.close();server.closeAllConnections();await once(server,'close');
  if(!directory.startsWith(join(tmpdir(),'leleka-mobile-')))throw Error('Unexpected fixture directory');
  await rm(directory,{recursive:true,force:true});
}
