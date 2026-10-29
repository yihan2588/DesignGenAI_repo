"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
export async function toggleCowriter(form:FormData){
 const {client}=await requireAdmin();const value=form.get('enabled');if(value!=='true'&&value!=='false')throw new Error('Choose a release state.');
 const {error}=await client.rpc('cowriter_admin',{p_enabled:value==='true'});if(error)throw new Error('The writer state could not be changed.');revalidatePath('/admin/cowriter');
}
