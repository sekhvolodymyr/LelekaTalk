import {randomUUID} from 'node:crypto';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function createWallRouter({database,blocked,readBody,persist,fail}){
  return async function route(request,url,user,reply){
    const path=url.pathname.slice('/api/mvp'.length),method=request.method;
    if(path!=='/wall'&&!path.startsWith('/wall/'))return false;
    const wall=database.wall??={posts:[],comments:[],reposts:[],sequence:0};
    const author=id=>{const u=database.users.find(u=>u.id===id);return {id,name:u?.personalName??'—',username:u?.username??''};};
    const visible=post=>post&&!blocked(user.id,post.authorId);
    const requirePost=id=>{const post=wall.posts.find(p=>p.id===id);if(!visible(post))throw fail(404,'post_not_found');return post;};
    const comments=post=>wall.comments.filter(c=>c.postId===post.id&&!blocked(user.id,c.authorId));
    const dto=post=>({id:post.id,text:post.text,author:author(post.authorId),createdAt:post.createdAt,isMine:post.authorId===user.id,likes:post.likes.length,liked:post.likes.includes(user.id),commentCount:comments(post).length,reposts:wall.reposts.filter(r=>r.postId===post.id).length,reposted:wall.reposts.some(r=>r.postId===post.id&&r.authorId===user.id)});
    const commentDTO=c=>({id:c.id,text:c.text,createdAt:c.createdAt,author:author(c.authorId),isMine:c.authorId===user.id});
    const text=(value,max)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw fail(400,'invalid_text');return value.trim();};
    const id=value=>{if(typeof value!=='string'||!UUID.test(value))throw fail(400,'invalid_id');return value;};
    const rate=(items,max)=>{if(items.filter(p=>p.authorId===user.id&&Date.now()-Date.parse(p.createdAt)<60000).length>=max)throw fail(429,'too_many_attempts');};
    if(path==='/wall'&&method==='GET'){
      const before=Number(url.searchParams.get('before')??Number.MAX_SAFE_INTEGER);
      if(!Number.isSafeInteger(before)||before<1)throw fail(400,'invalid_cursor');
      const mine=url.searchParams.get('mode')==='mine';
      const entries=[...wall.posts.filter(visible).map(post=>({id:post.id,seq:post.seq,createdAt:post.createdAt,post:dto(post),repostBy:null,owner:post.authorId})),...wall.reposts.filter(r=>!blocked(user.id,r.authorId)).flatMap(r=>{const post=wall.posts.find(p=>p.id===r.postId);return visible(post)?[{id:r.id,seq:r.seq,createdAt:r.createdAt,post:dto(post),repostBy:author(r.authorId),owner:r.authorId}]:[];})].filter(entry=>entry.seq<before&&(!mine||entry.owner===user.id)).sort((a,b)=>b.seq-a.seq);
      const page=entries.slice(0,30).map(({owner,...entry})=>entry);
      return reply(200,{entries:page,nextCursor:entries.length>30?page.at(-1).seq:null});
    }
    if(path==='/wall'&&method==='POST'){
      const body=await readBody(request),postId=id(body.id),value=text(body.text,500),existing=wall.posts.find(p=>p.id===postId);
      if(existing){if(existing.authorId!==user.id||existing.text!==value)throw fail(409,'post_conflict');return reply(200,{post:dto(existing)});}
      rate(wall.posts,10);
      const post={id:postId,seq:++wall.sequence,authorId:user.id,text:value,likes:[],createdAt:new Date().toISOString()};
      wall.posts.push(post);persist();return reply(201,{post:dto(post)});
    }
    const match=/^\/wall\/([a-f0-9-]{36})(?:\/(like|repost|comments)(?:\/([a-f0-9-]{36}))?)?$/.exec(path);
    if(!match)throw fail(404,'not_found');
    const [,postId,action,commentId]=match,post=requirePost(postId);
    if(!action&&method==='GET')return reply(200,{post:dto(post),comments:comments(post).slice(-100).map(commentDTO)});
    if(!action&&method==='DELETE'){
      if(post.authorId!==user.id)throw fail(403,'owner_required');
      wall.posts=wall.posts.filter(p=>p.id!==postId);wall.comments=wall.comments.filter(c=>c.postId!==postId);wall.reposts=wall.reposts.filter(r=>r.postId!==postId);persist();return reply(200,{ok:true});
    }
    if(['like','repost'].includes(action)&&!commentId&&method==='POST'){
      const body=await readBody(request),value=body[action==='like'?'liked':'reposted'];
      if(typeof value!=='boolean')throw fail(400,'invalid_payload');
      if(action==='like'){post.likes=post.likes.filter(uid=>uid!==user.id);if(value)post.likes.push(user.id);}
      else{
        const existing=wall.reposts.find(r=>r.postId===postId&&r.authorId===user.id);
        if(value&&!existing){rate(wall.reposts,20);wall.reposts.push({id:randomUUID(),seq:++wall.sequence,postId,authorId:user.id,createdAt:new Date().toISOString()});}
        if(!value)wall.reposts=wall.reposts.filter(r=>r!==existing);
      }
      persist();return reply(200,{post:dto(post)});
    }
    if(action==='comments'&&!commentId&&method==='POST'){
      const body=await readBody(request),commentId=id(body.id),value=text(body.text,1000),existing=wall.comments.find(c=>c.id===commentId);
      if(existing){if(existing.authorId!==user.id||existing.postId!==postId||existing.text!==value)throw fail(409,'comment_conflict');return reply(200,{comment:commentDTO(existing),post:dto(post)});}
      rate(wall.comments,30);if(wall.comments.filter(c=>c.postId===postId).length>=1000)throw fail(400,'comment_limit');
      const comment={id:commentId,postId,authorId:user.id,text:value,createdAt:new Date().toISOString()};wall.comments.push(comment);persist();return reply(201,{comment:commentDTO(comment),post:dto(post)});
    }
    if(action==='comments'&&commentId&&method==='DELETE'){
      const comment=wall.comments.find(c=>c.id===commentId&&c.postId===postId);if(!comment)throw fail(404,'record_not_found');
      if(comment.authorId!==user.id&&post.authorId!==user.id)throw fail(403,'owner_required');
      wall.comments=wall.comments.filter(c=>c!==comment);persist();return reply(200,{ok:true});
    }
    throw fail(405,'method_not_allowed');
  };
}
