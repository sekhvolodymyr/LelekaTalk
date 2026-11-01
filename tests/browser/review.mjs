import {createRequire} from 'node:module';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {createApp} from '../../phase-one/server.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const directory=mkdtempSync(path.join(tmpdir(),'leleka-call-qa-')),output=process.env.QA_OUTPUT ?? directory;
const server=createApp({dataDirectory:directory,pushService:null});server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
// Browser plugin not available; exercise real registration and encrypted chat.
// Only delay message transport and fail Feed transport to reproduce the races.
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required','--mute-audio']});
const errors=[];
async function user(username){const context=await browser.newContext({permissions:['microphone'],viewport:{width:1440,height:900}});const page=await context.newPage();page.setDefaultTimeout(25000);page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.locator('[data-action="auth-mode"]').click();for(const [name,value]of Object.entries({name:username,username,email:username+'@example.test',password:'audio-call-qa-password-123'}))await page.locator(`[name="${name}"]`).fill(value);await page.locator('[name="age"]').check();await page.locator('#auth-form [type="submit"]').click();await page.locator('#mvp-recovery-code').waitFor();await page.locator('[data-mvp="saved-code"]').click();return {page,context};}
try{
  const alice=await user('alice'),bob=await user('bob'),a=alice.page,b=bob.page;
  await a.locator('.new-chat').click();await a.locator('#mvp-user-search [name="query"]').fill('bob');await a.locator('#mvp-user-search [type="submit"]').click();await a.locator('[data-mvp="select-user"]').click();await b.locator('.chat-item').click();await b.locator('[data-mvp="accept"]').click();await a.locator('[data-audio-call]').waitFor();
  let release,seen;const gate=new Promise(r=>release=r),observed=new Promise(r=>seen=r);
  await a.route('**/api/mvp/chats/*/messages',async route=>{if(route.request().method()!=='POST')return route.continue();seen();await gate;await route.continue();});
  await a.locator('#mvp-message-form textarea').fill('First sent message');await a.locator('#mvp-message-form [type="submit"]').click();await observed;
  await a.locator('#mvp-message-form textarea').fill('Second draft remains');release();
  await b.getByText('First sent message',{exact:true}).waitFor();await a.waitForTimeout(500);
  const draft=await a.locator('#mvp-message-form textarea').inputValue();
  console.log('DRAFT REGRESSION:',draft==='Second draft remains'?'PASS':'FAIL');
  await a.unroute('**/api/mvp/chats/*/messages');
  await a.route('**/api/mvp/feed*',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"server_error"}'}));
  await a.locator('.sidebar [data-view="feed"]').click();await a.waitForTimeout(500);
  const feedVisible=await a.locator('[data-feed="forYou"]').count()>0;
  console.log('NAVIGATION REGRESSION:',feedVisible?'PASS':'FAIL');
  await a.screenshot({path:output+'/ub-review-desktop.png',fullPage:true});
  await a.unroute('**/api/mvp/feed*');
  await a.locator('.sidebar [data-view="chats"]').click();
  if(draft==='Second draft remains'){
    await a.locator('#mvp-message-form [type="submit"]').click();await b.getByText('Second draft remains',{exact:true}).waitFor();
  }
  await a.setViewportSize({width:390,height:667});await a.keyboard.press('Escape');await a.waitForTimeout(300);await a.screenshot({path:output+'/ub-review-mobile.png',fullPage:true});
  assert.equal(await a.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);assert.equal(draft,'Second draft remains');assert.equal(feedVisible,true);
  console.log('UB BROWSER QA PASSED: delayed encrypted send preserves and sends next draft, failed navigation selects Feed, mobile layout, zero JS errors.');}catch(e){console.error(e.message.slice(0,1500));console.error('Page errors:',errors);for(const [i,context]of browser.contexts().entries())for(const page of context.pages()){console.error('UI',i,(await page.locator('body').innerText()).slice(-1600));await page.screenshot({path:output+`/audio-qa-failure-${i}.png`,fullPage:true});}process.exitCode=1;}
finally{await browser.close();server.close();server.closeAllConnections();await once(server,'close');if(path.dirname(path.resolve(directory))!==path.resolve(tmpdir())||!path.basename(directory).startsWith('leleka-call-qa-'))throw Error('Unexpected cleanup path');rmSync(directory,{recursive:true,force:true});}



