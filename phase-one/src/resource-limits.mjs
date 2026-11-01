// Durable per-account limits work across serverless instances. Never trim
// existing history; reject growth and leave read/delete access available.
const fail=code=>Object.assign(new Error(code),{status:429,code});
export function limitWrites(database,userId,bucket='all',maximum=240){
  const now=Date.now(),rates=database.writeRates??={};
  for(const key of Object.keys(rates))if(rates[key].until<=now)delete rates[key];
  const key=`${userId}:${bucket}`,entry=rates[key]??={count:0,until:now+60000};
  if(entry.count>=maximum)throw fail('too_many_attempts');
  entry.count++;
}
export function requireStorage(database,userId,record,previous){
  const mvp=database.mvp??{},wall=database.wall??{};
  const collections=[['messages','senderId'],['plans','ownerId'],['habits','ownerId'],['channels','ownerId'],['posts','channelOwner'],['comments','authorId'],['reports','reporterId']];
  const ownChannels=new Set((mvp.channels??[]).filter(c=>c.ownerId===userId).map(c=>c.id));
  let size=0,count=0;
  const add=item=>{size+=Buffer.byteLength(JSON.stringify(item));count++;};
  for(const [name,owner] of collections)for(const item of mvp[name]??[])if(owner==='channelOwner'?ownChannels.has(item.channelId):item[owner]===userId)add(item);
  for(const name of ['posts','comments','reposts'])for(const item of wall[name]??[])if(item.authorId===userId)add(item);
  const growth=Buffer.byteLength(JSON.stringify(record))-(previous?Buffer.byteLength(JSON.stringify(previous)):0);
  if(growth>0&&(size+growth>50*1024*1024||!previous&&count>=50000))throw fail('storage_limit');
}
