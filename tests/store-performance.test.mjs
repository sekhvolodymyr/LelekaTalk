import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPostgresStore} from '../src/postgres-store.mjs';
import {requireStorage,limitWrites} from '../phase-one/src/resource-limits.mjs';

test('read-only store operations never serialize or write the full database; mutations still commit changes',async()=>{
 let serialized=0;const statements=[],database={value:1,toJSON(){serialized++;return {value:this.value};}};
 const query=async(text)=>{statements.push(text);return text.startsWith('SELECT payload')?{rows:[{payload:database}]}:{rows:[{id:1}]};};
 const pool={on(){},query,connect:async()=>({query,release(){}}),end:async()=>{}};
 const store=createPostgresStore('postgres://test@localhost/test',{bootstrap:false,pool});
 assert.equal(await store.run(false,d=>d.value),1);assert.equal(serialized,0);assert.equal(statements.some(s=>s.startsWith('UPDATE')),false);
 await store.run(true,d=>{d.value=2;});assert.equal(serialized,2);assert.equal(statements.filter(s=>s.startsWith('UPDATE')).length,1);assert.ok(statements.includes('COMMIT'));
});

test('account growth quotas preserve existing data, and write budgets are account-wide',()=>{
 const database={mvp:{plans:Array.from({length:50000},(_,i)=>({id:i,ownerId:'owner',ciphertext:'x'}))}};
 assert.throws(()=>requireStorage(database,'owner',{ownerId:'owner',ciphertext:'new'}),error=>error.code==='storage_limit');
 const old=database.mvp.plans[0];assert.doesNotThrow(()=>requireStorage(database,'owner',{...old,ciphertext:''},old));assert.equal(database.mvp.plans.length,50000);
 const before=JSON.stringify(database.mvp.plans);
 assert.throws(()=>requireStorage(database,'other',{ciphertext:'x'.repeat(50*1024*1024+1)}),error=>error.code==='storage_limit');
 assert.equal(JSON.stringify(database.mvp.plans),before);
 for(let i=0;i<240;i++)limitWrites(database,'owner');assert.throws(()=>limitWrites(database,'owner'),error=>error.code==='too_many_attempts');
 assert.doesNotThrow(()=>limitWrites(database,'other'));
});
