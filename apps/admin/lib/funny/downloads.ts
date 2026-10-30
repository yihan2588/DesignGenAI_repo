import 'server-only';
import {requireAdmin} from '@/lib/admin';
export type Download={id:string;created_at:string;actor:string|null;source:'gallery'|'lab';post_id:string|null;session_id:string|null;revision:number|null;option_id:string|null;caption:string;image_id:string|null;bucket:string;path:string;width:number;height:number};
export async function downloadLog(page=1,query='',id:string|null=null):Promise<{downloads:Download[];more:boolean;total:number}>{
 const {client}=await requireAdmin();const {data,error}=await client.rpc('funny_download_log',{p_page:page,p_query:query,p_id:id});
 if(error)throw new Error('Download activity could not be loaded.');return data;
}
