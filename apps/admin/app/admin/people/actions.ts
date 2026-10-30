'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin';
import { normalizeSignupValue } from '@/lib/funny/signup';
import { isUuid } from '@/lib/funny/validation';
export async function signupAccess(form: FormData) {
 const {client}=await requireAdmin();
 try {
  const action=String(form.get('action')),kind=String(form.get('kind'));
  if(!['save','delete','check'].includes(action)||!['domain','email'].includes(kind))throw new Error('Choose a valid signup action.');
  const id=form.get('id');if(id&&!isUuid(id))throw new Error('Choose a valid rule.');
  if(action==='delete'&&form.get('confirm')!=='yes')throw new Error('Confirm removal first.');
  const value=action==='delete'?null:normalizeSignupValue(kind,form.get('value'));
  const expected=id?normalizeSignupValue(kind,form.get('expected')):null;
  const {data,error}=await client.rpc('funny_signup_access',{p_action:action,p_kind:kind,p_id:id||null,p_value:value,p_expected:expected});
  if(error)return {error:/already exists|changed or was removed|valid domain|rule limit/.test(error.message)?error.message:'Could not save this rule. Please try again.'};
  if(action!=='check')revalidatePath('/admin/people');
  return {ok:true,allowed:data?.allowed as boolean|undefined,reason:data?.reason as string|undefined};
 }catch(e){return {error:e instanceof Error?e.message:'Check the fields and try again.'};}
}
