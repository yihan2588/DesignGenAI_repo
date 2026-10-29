// Produce reviewable DML batches for the Supabase connector. No privileged credential is required by this script.
import { readFile,mkdir,writeFile } from 'node:fs/promises';
const records=JSON.parse(await readFile('.cowriter-cache/records.json','utf8'));
await mkdir('.cowriter-cache/sql',{recursive:true});
const literal=value=>value==null?'NULL':"'"+String(value).replaceAll("'","''")+"'";
const fields=['id','source_url','source_hash','description','description_origin','affordances','family','storage_path','width','height','available','embedding','index_version'];
for(let i=0;i<records.length;i+=20){
 const rows=records.slice(i,i+20).map(r=>'('+fields.map(k=>k==='embedding'?(r[k]?literal(JSON.stringify(r[k]))+'::extensions.vector':'NULL'):literal(r[k])).join(',')+')');
 const sql=`insert into public.cowriter_catalog (${fields.join(',')}) values ${rows.join(',\n')} on conflict (id) do update set ${fields.slice(1).map(k=>`${k}=excluded.${k}`).join(',')},updated_at=now();\n`;
 await writeFile(`.cowriter-cache/sql/${String(i/20).padStart(3,'0')}.sql`,sql);
}
console.log(`Prepared ${Math.ceil(records.length/20)} catalog batches. Review before applying with the Supabase connector.`);
