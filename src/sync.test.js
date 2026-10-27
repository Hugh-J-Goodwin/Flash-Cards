import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LibraryStore,SyncEngine,libraryKey} from './sync.js';
import {empty} from './model.js';
const copy=x=>structuredClone(x);
const library=name=>({...empty(),subjects:[{id:name,name}]});
function storage(){const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};}
function setup(){
 const disk=storage(),store=new LibraryStore(disk);store.load('alice');
 let row=null,reads=0,writes=0;
 const remote={read:async()=>{reads++;return copy(row);},write:async(_owner,data,v)=>{writes++;if((row?.version??null)!==v)return null;row={data:copy(data),version:(v??0)+1};return row.version;}};
 const messages=[];const engine=new SyncEngine({store,remote,status:t=>messages.push(t)});
 engine.schedule=()=>{};
 return {disk,store,remote,engine,messages,get row(){return row;},set row(r){row=r;},get writes(){return writes;}};
}
test('legacy shared data stays in guest library and is not assigned to accounts',()=>{
 const disk=storage();disk.setItem('study-space-v1',JSON.stringify(library('Legacy')));
 const store=new LibraryStore(disk);assert.equal(store.snapshot.data.subjects[0].name,'Legacy');store.load('alice');assert.equal(store.snapshot.data.subjects.length,0);store.save(library('Alice'));store.load('bob');assert.equal(store.snapshot.data.subjects.length,0);store.load('alice');assert.equal(store.snapshot.data.subjects[0].name,'Alice');assert.ok(disk.getItem('study-space-v1'));
});
test('automatically loads cloud library and uploads edits using its persisted version',async()=>{
 const h=setup();h.row={data:library('Cloud'),version:4};await h.engine.run();assert.equal(h.store.snapshot.version,4);
 h.store.save(library('Edited'));await h.engine.run();assert.equal(h.row.version,5);assert.equal(h.row.data.subjects[0].name,'Edited');assert.equal(h.store.snapshot.dirty,false);
 const restored=new LibraryStore(h.disk);restored.load('alice');assert.equal(restored.snapshot.version,5);
});
test('offline edits survive restart and sync when connectivity returns',async()=>{
 const h=setup();h.store.save(library('Offline'));const read=h.remote.read;h.remote.read=async()=>{throw Error('Offline');};await h.engine.run();assert.equal(h.store.snapshot.dirty,true);assert.ok(h.messages.at(-1).includes('pending'));
 h.store.load('alice');h.remote.read=read;await h.engine.run();assert.equal(h.row.data.subjects[0].name,'Offline');assert.equal(h.store.snapshot.dirty,false);
});
test('two-device conflict pauses without overwriting either version; cloud choice backs up both',async()=>{
 const h=setup();h.row={data:library('Original'),version:1};await h.engine.run();h.store.save(library('Local edit'));h.row={data:library('Other device'),version:2};await h.engine.run();assert.equal(h.writes,0);assert.ok(h.engine.conflict);assert.equal(h.store.snapshot.data.subjects[0].name,'Local edit');
 await h.engine.resolve('cloud');assert.equal(h.store.snapshot.data.subjects[0].name,'Other device');const backup=JSON.parse(h.disk.getItem('study-space-conflict:alice'));assert.equal(backup.local.subjects[0].name,'Local edit');assert.equal(backup.cloud.subjects[0].name,'Other device');assert.equal(h.engine.conflict,null);
});
test('local conflict choice compares version and never blindly overwrites a newer cloud',async()=>{
 const h=setup();h.row={data:library('Original'),version:1};await h.engine.run();h.store.save(library('Local'));h.row={data:library('Remote'),version:2};await h.engine.run();h.row={data:library('Newer'),version:3};await h.engine.resolve('local');assert.equal(h.row.version,3);assert.ok(h.engine.conflict);await h.engine.resolve('local');assert.equal(h.row.version,4);assert.equal(h.row.data.subjects[0].name,'Local');assert.equal(h.engine.conflict,null);
});
test('compare-and-swap failure leaves local edits dirty for conflict detection',async()=>{
 const h=setup();h.store.save(library('Local'));h.remote.write=async()=>null;await h.engine.run();assert.equal(h.store.snapshot.dirty,true);assert.equal(h.store.snapshot.version,null);
});
test('editing during upload retains the newer local edit and schedules another save',async()=>{
 const h=setup();h.store.save(library('First'));let release;const oldWrite=h.remote.write;h.remote.write=async(...args)=>{await new Promise(r=>release=r);return oldWrite(...args);};const pending=h.engine.run();await new Promise(r=>setTimeout(r,0));h.store.save(library('Second'));release();await pending;assert.equal(h.row.data.subjects[0].name,'First');assert.equal(h.store.snapshot.data.subjects[0].name,'Second');assert.equal(h.store.snapshot.dirty,true);assert.equal(h.store.snapshot.version,1);
 h.remote.write=oldWrite;await h.engine.run();assert.equal(h.row.data.subjects[0].name,'Second');assert.equal(h.store.snapshot.dirty,false);
});
test('signing out during a request cannot apply the old account response to another account',async()=>{
 const h=setup();let release;h.remote.read=()=>new Promise(r=>release=r);const pending=h.engine.run();h.engine.switchAccount('bob');release({data:library('Alice private'),version:1});await pending;assert.equal(h.store.owner,'bob');assert.equal(h.store.snapshot.data.subjects.length,0);assert.equal(h.disk.getItem(libraryKey('bob')),null);
});
test('remote updates wait while an editor or quiz is open',async()=>{
 const h=setup();h.row={data:library('Cloud'),version:1};h.engine.canApply=()=>false;await h.engine.run();assert.equal(h.store.snapshot.data.subjects.length,0);h.engine.canApply=()=>true;await h.engine.run();assert.equal(h.store.snapshot.data.subjects[0].name,'Cloud');
});
test('same-device stale editor fails without replacing another tab’s changes',()=>{
 const h=setup();const second=new LibraryStore(h.disk);second.load('alice');h.store.save(library('First tab'));assert.throws(()=>second.save(library('Stale tab')),/another tab/);assert.equal(JSON.parse(h.disk.getItem(libraryKey('alice'))).data.subjects[0].name,'First tab');
});
test('storage failures do not discard unsynced data or resolve a conflict',async()=>{
 const h=setup();h.store.save(library('Local'));h.row={data:library('Remote'),version:1};await h.engine.run();h.disk.setItem=()=>{throw Error('quota exceeded');};await h.engine.resolve('cloud');assert.ok(h.engine.conflict);assert.equal(h.store.snapshot.data.subjects[0].name,'Local');assert.equal(h.store.snapshot.dirty,true);
});
