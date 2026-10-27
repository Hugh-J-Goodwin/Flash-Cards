import {test,expect} from '@playwright/test';
const alice='11111111-1111-4111-8111-111111111111',bob='22222222-2222-4222-8222-222222222222';
function library(name='Biology'){return {subjects:[{id:'s',name}],topics:[{id:'t',name:'Cells',subjectId:'s'}],cards:[{id:'c',topicId:'t',front:'What is a cell?',back:'The basic unit of life'}],quizzes:[{id:'q',topicId:'t',title:'Cells quiz',questions:[{prompt:'Basic unit of life?',options:['Cell','Atom','Rock','Water'],correct:0}]}]};}
function auth(owner){const user={id:owner,email:owner===alice?'alice@example.com':'bob@example.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()};const exp=Math.floor(Date.now()/1000)+3600;return {access_token:`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({sub:owner,exp})).toString('base64url')}.test`,refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,expires_at:exp,user};}
async function seed(context,{owner=null,legacy=null,snapshot=null}={}){
 await context.addInitScript(({owner,session,legacy,snapshot})=>{
  if(session&&!localStorage.getItem('seeded-auth')){localStorage.setItem('sb-study-test-auth-token',JSON.stringify(session));localStorage.setItem('seeded-auth','yes');}
  if(legacy&&!localStorage.getItem('study-space-v1'))localStorage.setItem('study-space-v1',JSON.stringify(legacy));
  if(snapshot&&!localStorage.getItem('study-space-v2:'+owner))localStorage.setItem('study-space-v2:'+owner,JSON.stringify(snapshot));
 },{owner,session:owner?auth(owner):null,legacy,snapshot});
}
async function backend(context,rows){
 await context.route('https://study-test.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url());const owner=url.searchParams.get('user_id')?.replace('eq.','');
  const fulfill=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body),headers:{'access-control-allow-origin':'*'}});
  if(url.pathname.startsWith('/auth/v1/'))return fulfill({});
  if(req.method()==='GET')return fulfill(rows.get(owner)||null);
  const body=req.postDataJSON();
  if(req.method()==='POST'){
   if(rows.has(body.user_id))return fulfill({code:'23505',message:'Duplicate'},409);
   rows.set(body.user_id,{data:body.data,version:1});return fulfill([{version:1}],201);
  }
  if(req.method()==='PATCH'){
   const row=rows.get(owner);if(row?.version!==Number(url.searchParams.get('version')?.replace('eq.','')))return fulfill([]);
   rows.set(owner,{data:body.data,version:body.version});return fulfill([{version:body.version}]);
  }
  return fulfill({});
 });
}
async function editCard(page,text){await page.locator('#edit-card').click();await page.locator('[name=front]').fill(text);await page.getByRole('button',{name:'Save flashcard'}).click();}

test('ratings update due queue and quiz history survives reload on a phone layout',async({page,context})=>{
 await seed(context,{legacy:library()});await backend(context,new Map());await page.goto('/');
 await page.locator('#review-mode').click();await page.locator('#flip').click();await page.locator('[data-rate=easy]').click();
 await expect(page.getByRole('heading',{name:'No cards due'})).toBeVisible();
 await page.locator('[data-tab=progress]').click();await expect(page.locator('.metric-grid article').nth(0)).toContainText('0');await expect(page.locator('.metric-grid article').nth(1)).toContainText('1');
 await page.locator('[data-tab=quizzes]').click();await page.locator('[data-run]').click();await page.locator('[data-answer="0"]').click();await page.locator('#quiz-next').click();await expect(page.getByRole('heading',{name:'1 / 1',exact:true})).toBeVisible();
 await page.locator('#finish-quiz').click();await page.locator('[data-tab=progress]').click();await expect(page.locator('.history-row')).toContainText('1 / 1 · 100%');
 await page.reload();await page.locator('[data-tab=progress]').click();await expect(page.locator('.history-row')).toContainText('Cells quiz');
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('cloud library loads automatically, edits auto-save, and conflicts preserve both versions',async({browser})=>{
 const rows=new Map([[alice,{data:library('Alice cloud'),version:1}]]);
 const a=await browser.newContext(),b=await browser.newContext();await seed(a,{owner:alice});await seed(b,{owner:alice});await backend(a,rows);await backend(b,rows);
 const first=await a.newPage(),second=await b.newPage();
 await first.goto('/');await expect(first.locator('h1')).toHaveText('Alice cloud');
 await second.goto('/');await expect(second.locator('h1')).toHaveText('Alice cloud');
 // Keep the second device's editor open so incoming changes cannot erase its draft.
 await second.locator('#edit-card').click();await second.locator('[name=front]').fill('Second device draft');
 await editCard(first,'First device saved');await expect.poll(()=>rows.get(alice).version).toBe(2);
 await second.getByRole('button',{name:'Save flashcard'}).click();await expect(second.locator('#sync-alert')).toBeVisible();
 expect(rows.get(alice).data.cards[0].front).toBe('First device saved');await expect(second.locator('#flip')).toContainText('Second device draft');
 await second.locator('#settings').click();second.on('dialog',d=>d.accept());await second.locator('#keep-cloud').click();await expect(second.locator('#conflict-actions')).toBeHidden();await second.locator('.close').click();await expect(second.locator('#flip')).toContainText('First device saved');
 const backup=await second.evaluate(id=>JSON.parse(localStorage.getItem('study-space-conflict:'+id)),alice);expect(backup.local.cards[0].front).toBe('Second device draft');expect(backup.cloud.cards[0].front).toBe('First device saved');
 await a.close();await b.close();
});

test('offline signed-in edits persist after reload and upload on reconnect',async({page,context})=>{
 const rows=new Map([[alice,{data:library(),version:1}]]);await seed(context,{owner:alice});await backend(context,rows);await page.goto('/');await expect(page.locator('#flip')).toBeVisible();
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.reload();
 await context.setOffline(true);await context.unroute('https://study-test.supabase.co/**');
 await editCard(page,'Offline question');await page.reload();await expect(page.locator('#flip')).toContainText('Offline question');expect(rows.get(alice).version).toBe(1);
 await backend(context,rows);await context.setOffline(false);await expect.poll(()=>rows.get(alice).data.cards[0].front,{timeout:20000}).toBe('Offline question');
 await expect(page.locator('#account-status')).toHaveText('All changes synced');
});

test('sign-out removes account content from view without uploading the old shared library',async({page,context})=>{
 const rows=new Map([[alice,{data:library('Private Alice'),version:1}]]);await seed(context,{owner:alice,legacy:library('Old device-only')});await backend(context,rows);await page.goto('/');await expect(page.locator('h1')).toHaveText('Private Alice');
 await page.locator('#settings').click();await page.locator('#signout').click();await expect(page.locator('h1')).toHaveText('Old device-only');expect(rows.get(alice).data.subjects[0].name).toBe('Private Alice');
});

test('another account receives only its own library',async({page,context})=>{
 const rows=new Map([[alice,{data:library('Private Alice'),version:1}],[bob,{data:library('Private Bob'),version:1}]]);
 await seed(context,{owner:bob,legacy:library('Old Alice device data'),snapshot:{data:library('Bob local'),version:1,dirty:false,revision:1}});
 await backend(context,rows);await page.goto('/');await expect(page.locator('h1')).toHaveText('Bob local');await expect(page.locator('body')).not.toContainText('Private Alice');await expect(page.locator('body')).not.toContainText('Old Alice');
});

test('production service worker caches app and allows offline editing after a reload',async({page,context})=>{
 await seed(context,{legacy:library()});await backend(context,new Map());const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.reload();
 await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
 const manifest=await (await page.request.get('/manifest.webmanifest')).json();expect(manifest.display).toBe('standalone');expect(manifest.icons.length).toBe(3);
 await context.setOffline(true);await page.reload();await expect(page.locator('#flip')).toContainText('What is a cell?');await editCard(page,'Edited offline');await page.reload();await expect(page.locator('#flip')).toContainText('Edited offline');expect(errors).toEqual([]);
});
