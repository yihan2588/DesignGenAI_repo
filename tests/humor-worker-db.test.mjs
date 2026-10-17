import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

// Real PostgreSQL semantics in an isolated process; Storage/Auth are minimal fixtures.
// PGlite serializes connections: this does not prove concurrent SKIP LOCKED behavior.
test('worker migration: capabilities, retrieval, leases, budgets, and persisted vote gating', async () => {
 const db=new PGlite({extensions:{vector,pgcrypto}});
 try {
 await db.exec(`create role anon; create role authenticated; create schema private; create schema auth; create schema storage; create schema extensions;
 create extension pgcrypto with schema extensions;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
 create table public.profiles(id uuid,first_name text,last_name text);
 create table storage.buckets(id text,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(bucket_id text,name text);
 create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261016035931_humorllm_comparisons.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/20261016043001_exempt_humor_examples_from_member_quota.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/20261016044150_reveal_caption_methods_and_generate_metadata.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/20261016180840_humorllm_retrieval_and_worker.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/20261016191000_humor_source_review_checkpoint.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/20261016193000_humor_source_revision_checkpoint.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/20261017001920_humor_no_rag_fallback.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/20261017003750_humor_serverless_dispatch.sql',import.meta.url),'utf8'));
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const key='isolated-worker-test-key-12345678901234567890',writer='isolated-writer-test-key',owner=randomUUID(),other=randomUUID();
 assert.equal((await q('select enabled from private.humor_worker_config'))[0].enabled,false);
 await assert.rejects(q('select public.humor_worker_ping($1,$2)',['wrong',randomUUID()]),/access denied/);
 await q("update private.humor_worker_config set worker_key_sha256=encode(extensions.digest($1,'sha256'),'hex'),ingest_enabled=true",[key]);
 await q("insert into private.humor_config(singleton,writer_key_sha256) values(true,encode(extensions.digest($1,'sha256'),'hex'))",[writer]);
 await q('insert into auth.users values($1),($2)',[owner,other]);
 const vec=JSON.stringify([1,...Array(767).fill(0)]),text='A test joke about paperwork.';
 const row={id:'cc-en-00001',text,text_sha256:createHash('sha256').update(text).digest('hex'),situation_text:'Office paperwork',mechanism_text:'Exaggeration',annotation:{decision:'include',risk_flags:[]},embedding_model:'sentence-transformers/all-mpnet-base-v2',embedding_revision:'e8c3b32edf5434bc2275fc9bab85f82640a19130',full_embedding:vec,situation_embedding:vec,mechanism_embedding:vec};
 assert.equal((await q('select public.humor_ingest_examples($1,$2,$3::jsonb) n',[key,'cleancomedy-en-annotations-v2',JSON.stringify([row])]))[0].n,1);
 assert.equal((await q('select public.humor_ingest_examples($1,$2,$3::jsonb) n',[key,'cleancomedy-en-annotations-v2',JSON.stringify([row])]))[0].n,0);
 for(const method of ['full_dense','hybrid']) {
   assert.equal((await q('select * from public.humor_retrieval_search($1,$2,$3,$4::extensions.vector,$4::extensions.vector,$5)',[key,'cleancomedy-en-annotations-v2','paperwork',vec,method])).length,1);
 }
 assert.equal((await q("select * from public.humor_retrieval_search($1,$2,'paperwork',$3::extensions.vector,$3::extensions.vector,'full_dense','production')",[key,'cleancomedy-en-annotations-v2',vec])).length,0);
 await assert.rejects(q('select public.humor_worker_export_batch($1,0)',['wrong']),/access denied/);
 assert.deepEqual((await q('select public.humor_worker_export_batch($1,0) rows',[key]))[0].rows,[]);
 await db.exec('update private.joke_sources set production_approved=true; update private.joke_examples set production_eligible=true');
 const exported=(await q('select public.humor_worker_export_batch($1,0) rows',[key]))[0].rows;
 assert.equal(exported.length,1);assert.equal(exported[0].text,text);assert.equal(exported[0].full_embedding.length,768);
 await db.exec('set role anon');
 await assert.rejects(q('select * from private.joke_examples'),/permission denied/);
 await assert.rejects(q('select public.humor_worker_ping($1,$2)',['wrong',randomUUID()]),/access denied/);
 await q('select public.humor_worker_ping($1,$2)',[key,randomUUID()]);
 await db.exec('reset role');
 const runs=[];
 for(let i=0;i<20;i++) {
  const image=randomUUID(),run=randomUUID();runs.push(run);
  await q("insert into public.humor_images(id,owner_id,title,alt_text,storage_path,metadata_pending) values($1,$2,'Pending','Pending',$3,true)",[image,owner,`${owner}/${image}.jpg`]);
  await q('insert into public.humor_runs(id,image_id,owner_id,request_key) values($1,$2,$3,$4)',[run,image,owner,randomUUID()]);
  await q('insert into private.humor_run_details(run_id) values($1)',[run]);
 }
 await q("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
 await assert.rejects(q('select public.humor_enqueue($1,$2)',[runs[0],writer]),/unavailable/);
 // Only this ephemeral fixture approves the source. No live source is approved by this test.
 await db.exec('update private.humor_worker_config set enabled=true,production_corpus_approved=true');
 await q("update private.humor_worker_config set dispatch_mode='vercel_queue',canary_user_ids=array[$1::uuid]",[owner]);
 const workers=Array.from({length:5},()=>randomUUID());
 await q('select public.humor_worker_ping($1,$2)',[key,workers[0]]);
 await db.exec('set role authenticated');
 await q("select set_config('request.jwt.claim.sub',$1,false)",[other]);
 await assert.rejects(q('select public.humor_enqueue($1,$2)',[runs[0],writer]),/limited test/);
 await db.exec('reset role');
 await q('update private.humor_worker_config set canary_user_ids=array[$1::uuid,$2::uuid]',[owner,other]);
 await db.exec('set role authenticated');
 await assert.rejects(q('select public.humor_enqueue($1,$2)',[runs[0],writer]),/not found/);
 await q("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
 for(const run of runs) await q('select public.humor_enqueue($1,$2)',[run,writer]);
 await q('select public.humor_enqueue($1,$2)',[runs[0],writer]);
 await db.exec('reset role');
 assert.equal((await q('select count(*)::int n from private.humor_jobs'))[0].n,20);
 await db.exec('reset role');
 await db.exec('set role anon');
 const claims=[];
 for(let i=0;i<5;i++) claims.push((await q('select public.humor_worker_claim($1,$2) job',[key,workers[i]]))[0].job);
 assert.equal(new Set(claims.map(j=>j.run_id)).size,5);
 await db.exec('reset role');
 const j=claims[0];
 assert.equal((await q('select public.humor_worker_claim_run($1,$2,$3) job',[key,workers[1],j.run_id]))[0].job,null);
 await assert.rejects(q('select public.humor_worker_claim_run($1,$2,$3)',['wrong',workers[1],j.run_id]),/access denied/);
 await q("select public.humor_worker_checkpoint($1,$2,$3,'source_revision','{}')",[key,j.run_id,j.lease_token]);
 for(const stage of ['fallback_candidates','fallback_judge']) await q('select public.humor_worker_checkpoint($1,$2,$3,$4,$5::jsonb)',[key,j.run_id,j.lease_token,stage,JSON.stringify({saved:true})]);
 await q('select public.humor_worker_checkpoint($1,$2,$3,$4,$5::jsonb)',[key,j.run_id,j.lease_token,'runtime_receipt',JSON.stringify({steps:'x'.repeat(180001)})]);
 await assert.rejects(q('select public.humor_worker_checkpoint($1,$2,$3,$4,$5::jsonb)',[key,j.run_id,j.lease_token,'scene',JSON.stringify({x:'x'.repeat(180001)})]),/Invalid checkpoint/);
 await assert.rejects(q('select public.humor_worker_checkpoint($1,$2,$3,$4,$5::jsonb)',[key,j.run_id,j.lease_token,'runtime_receipt',JSON.stringify({x:'x'.repeat(1200001)})]),/Invalid checkpoint/);
 await q('select public.humor_worker_checkpoint($1,$2,$3,$4,$5::jsonb)',[key,j.run_id,j.lease_token,'source_review',JSON.stringify({ranking:[]})]);
 await assert.rejects(q("select public.humor_worker_checkpoint($1,$2,$3,'source_review','{}')",['wrong',j.run_id,j.lease_token]),/access denied/);
 await assert.rejects(q("select public.humor_worker_checkpoint($1,$2,$3,'invented_stage','{}')",[key,j.run_id,j.lease_token]),/Invalid checkpoint/);
 await q('select public.humor_worker_checkpoint($1,$2,$3,$4,$5::jsonb)',[key,j.run_id,j.lease_token,'scene',JSON.stringify({title:'Resumable'})]);
 await q("update private.humor_jobs set lease_until=now()-interval '1 second' where run_id=$1",[j.run_id]);
 await assert.rejects(q("select public.humor_worker_checkpoint($1,$2,$3,'scene','{}')",[key,j.run_id,j.lease_token]),/lease expired/);
 await assert.rejects(q("select public.humor_worker_checkpoint($1,$2,$3,'source_review','{}')",[key,j.run_id,j.lease_token]),/lease expired/);
 const renewed=(await q('select public.humor_worker_claim_run($1,$2,$3) job',[key,workers[1],j.run_id]))[0].job;
 assert.equal(renewed.run_id,j.run_id);assert.equal(renewed.checkpoints.scene.title,'Resumable');assert.notEqual(renewed.lease_token,j.lease_token);
 assert.deepEqual(renewed.checkpoints.source_review,{ranking:[]});
 for(let i=0;i<12;i++) {
   const id=(await q('select public.humor_worker_reserve($1,$2,$3,$4) id',[key,renewed.run_id,renewed.lease_token,'scene']))[0].id;
   if(i!==11) await q('select public.humor_worker_settle($1,$2,$3,$4,$5)',[key,renewed.run_id,renewed.lease_token,id,0.001]);
 }
 await assert.rejects(q("select public.humor_worker_reserve($1,$2,$3,'scene')",[key,renewed.run_id,renewed.lease_token]),/attempt limit/);
 assert.equal(Number((await q('select sum(coalesce(actual_usd,reserved_usd)) total from private.humor_model_calls'))[0].total),.111);
 await db.exec('update private.humor_worker_config set prior_spent_usd=24.99');
 await assert.rejects(q("select public.humor_worker_reserve($1,$2,$3,'scene')",[key,claims[1].run_id,claims[1].lease_token]),/budget exhausted/);
 await db.exec('update private.humor_worker_config set prior_spent_usd=0.2039485');
 const result={status:'ready',baseline:'I brought the paperwork.',guided:'The paperwork brought its own paperwork.',metadata:{title:'Office',description:'A person at a desk.'},corpus_version:'cleancomedy-en-annotations-v2',production_eligible:true,steps:[],guided_mode:'no_rag_fallback',selected_caption_source_ids:[],retrieval_evidence_ids:[],fallback:{source_free:true}};
 await assert.rejects(q('select public.humor_worker_finish($1,$2,$3,$4::jsonb)',[key,j.run_id,j.lease_token,JSON.stringify(result)]),/lease expired/);
 await assert.rejects(q('select public.humor_worker_finish($1,$2,$3,$4::jsonb)',[key,renewed.run_id,renewed.lease_token,JSON.stringify({...result,selected_caption_source_ids:['j1']})]),/Invalid fallback provenance/);
 await assert.rejects(q('select public.humor_worker_finish($1,$2,$3,$4::jsonb)',[key,renewed.run_id,renewed.lease_token,JSON.stringify({...result,guided_mode:'rag'})]),/Missing retrieval contribution/);
 await q('select public.humor_worker_finish($1,$2,$3,$4::jsonb)',[key,renewed.run_id,renewed.lease_token,JSON.stringify(result)]);
 assert.equal((await q('select status from public.humor_runs where id=$1',[j.run_id]))[0].status,'ready');
 assert.deepEqual((await q('select public.humor_worker_claim_run($1,$2,$3) job',[key,workers[1],j.run_id]))[0].job,{terminal:true,status:'ready'});
 await assert.rejects(q("update public.humor_runs set caption_a='changed' where id=$1",[j.run_id]),/immutable/);
 await assert.rejects(q('select public.humor_poll($1)',[j.run_id]),/Choose a caption/);
 const revealed=(await q("select public.humor_vote($1,'A') poll",[j.run_id]))[0].poll;
 assert.equal(revealed.total,1);assert.ok(['A','B'].includes(revealed.baseline_slot));
 // A verified-RAG-shaped result remains publishable, with private mode provenance.
 const ragResult={...result,guided_mode:'rag',fallback:null,selected_caption_source_ids:['cc-en-00001'],retrieval_evidence_ids:['cc-en-00001']};
 await q('select public.humor_worker_finish($1,$2,$3,$4::jsonb)',[key,claims[1].run_id,claims[1].lease_token,JSON.stringify(ragResult)]);
 assert.equal((await q("select result->>'guided_mode' mode from private.humor_run_details where run_id=$1",[claims[1].run_id]))[0].mode,'rag');
 // Other 18 jobs terminate without publishing fake pairs.
 const active=claims.slice(2);
 for(const x of active) await q('select public.humor_worker_finish($1,$2,$3,null,$4)',[key,x.run_id,x.lease_token,'test failure']);
 for(let i=0;i<15;i++) {const x=(await q('select public.humor_worker_claim($1,$2) job',[key,workers[i%5]]))[0].job;assert.ok(x);await q('select public.humor_worker_finish($1,$2,$3,null,$4)',[key,x.run_id,x.lease_token,'test failure']);}
 assert.equal((await q("select count(*)::int n from private.humor_jobs where state in ('ready','failed')"))[0].n,20);
 assert.equal((await q('select public.humor_worker_claim($1,$2) job',[key,workers[0]]))[0].job,null);
 } finally {await db.close();}
});
