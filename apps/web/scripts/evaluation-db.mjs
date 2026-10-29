import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {readFile} from 'node:fs/promises';
export async function evaluationDatabase(records){
 const db=new PGlite({extensions:{vector}});
 await db.exec(`create role anon;create role authenticated;create schema private;create schema auth;create schema storage;create schema extensions;create extension vector with schema extensions;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$select '00000000-0000-4000-8000-000000000001'::uuid$$;
 create function private.check_humor_writer(text) returns void language sql as $$select$$;
 create function private.require_superadmin() returns void language sql as $$select$$;
 create function private.admin_access() returns boolean language sql as $$select true$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(bucket_id text,name text);
 create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;`);
 await db.exec(await readFile('supabase/migrations/20261029063133_funnyllm_cowriter.sql','utf8'));
 for(const row of records)await db.query(`insert into public.cowriter_catalog(id,source_url,source_hash,description,description_origin,affordances,family,storage_path,width,height,available,embedding,index_version) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::extensions.vector,$13)`,[row.id,row.source_url,row.source_hash,row.description,row.description_origin,row.affordances,row.family,row.storage_path,row.width,row.height,row.available,row.embedding?JSON.stringify(row.embedding):null,row.index_version]);
 return db;
}
