import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWall} from '../phase-one/public/wall.js';

test('obsolete wall failure cannot replace a newer filter result',async t=>{
  let click;const pending=[];
  const previousDocument=globalThis.document,previousLocation=globalThis.location;
  globalThis.location={href:'http://localhost/'};
  globalThis.document={querySelector:()=>null,querySelectorAll:()=>[{dataset:{wall:'filter',mode:'mine'},addEventListener:(_,fn)=>{click=fn;}}]};
  t.after(()=>{globalThis.document=previousDocument;globalThis.location=previousLocation;});
  const wall=createWall({api:()=>new Promise((resolve,reject)=>pending.push({resolve,reject})),getState:()=>({language:'en',view:'wall',user:{personalName:'Alice'}}),escapeHTML:String,toast:()=>{},renderShell:()=>{}});
  const initial=wall.start();wall.bind();click();
  pending[1].resolve({entries:[],nextCursor:null});await new Promise(setImmediate);
  assert.doesNotMatch(wall.render(),/Could not load posts/);
  pending[0].reject(new Error('obsolete request failed'));await initial;
  assert.doesNotMatch(wall.render(),/Could not load posts/);
  assert.match(wall.render(),/My posts/);
});
