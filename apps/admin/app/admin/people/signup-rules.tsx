'use client';
import {useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import type {SignupRule} from '@/lib/funny/signup';
import {signupAccess} from './actions';

export function SignupRules({rules,enforced}:{rules:SignupRule[];enforced:boolean}){
 const [kind,setKind]=useState<'domain'|'email'>('domain'),[query,setQuery]=useState('');
 const [editing,setEditing]=useState<SignupRule|null>(null),[removing,setRemoving]=useState<SignupRule|null>(null);
 const [message,setMessage]=useState(''),[failed,setFailed]=useState(false),[pending,startTransition]=useTransition();
 const [check,setCheck]=useState('');const router=useRouter();
 function submit(form:FormData,done?:()=>void){
  setMessage('');setFailed(false);
  startTransition(async()=>{try{const result=await signupAccess(form);if(result.error){setFailed(true);setMessage(result.error);return;}
   if(form.get('action')==='check'){setCheck(result.allowed?`Eligible for a new account: matches ${result.reason==='email'?'an email exception':'an allowed domain'}.`:'Not eligible for a new account: no matching rule.');return;}
   setCheck('');setMessage(form.get('action')==='delete'?'Rule removed. Existing accounts are unaffected.':'Signup rule saved.');done?.();router.refresh();
  }catch{setFailed(true);setMessage('The request could not finish. Please try again.');}});
 }
 const visible=rules.filter(r=>r.kind===kind&&r.value.includes(query.trim().toLowerCase()));
 return <section id="signup-rules" className="section-block signup-access">
  <h2>Who can create an account?</h2>{!enforced&&<p className="signup-removal" role="status"><strong>Setup in progress — signups are still open.</strong> Prepare the rules below. Restrictions will be activated once the initial audience is confirmed.</p>}<p>A new Google account needs an <strong>allowed domain or an email exception</strong>. Existing accounts keep working. These rules never grant admin access.</p>
  <div className="signup-tabs" role="group" aria-label="Signup rule lists">{(['domain','email'] as const).map(k=><button key={k} className={`button ${kind===k?'primary':''}`} aria-pressed={kind===k} disabled={pending} onClick={()=>{setKind(k);setQuery('');setEditing(null);setRemoving(null);setMessage('');}}>{k==='domain'?'Allowed domains':'Email exceptions'} <span>({rules.filter(r=>r.kind===k).length})</span></button>)}</div>
  {message&&<p role={failed?'alert':'status'} className={failed?'error-message':'form-message'}>{message}</p>}
  <div className="signup-columns"><div>
   <h3>{kind==='domain'?'Allowed signup domains':'Whitelisted email addresses'}</h3>
   <p className="signup-help">{kind==='domain'?'Allow everyone with this exact email domain. For example, columbia.edu does not include alumni.columbia.edu.':'Allow a designated person even when their domain is not listed. This does not send an invitation or create an account.'}</p>
   <form key={kind} className="operation-form signup-add" onSubmit={e=>{e.preventDefault();const el=e.currentTarget;const f=new FormData(el);f.set('action','save');f.set('kind',kind);submit(f,()=>el.reset());}}>
    <fieldset disabled={pending}><label>{kind==='domain'?'New domain':'New email exception'}<input name="value" type={kind==='email'?'email':'text'} required maxLength={kind==='domain'?253:254} placeholder={kind==='domain'?'columbia.edu':'guest@example.com'} autoCapitalize="none" spellCheck={false}/></label><button className="button primary">{pending?'Saving…':kind==='domain'?'Add domain':'Add email'}</button></fieldset>
   </form>
   <label className="signup-search">Filter {kind==='domain'?'domains':'emails'}<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a rule…"/></label>
   <ul className="signup-rule-list">{visible.map(rule=><li key={rule.id}>
    {editing?.id===rule.id?<form className="operation-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);f.set('action','save');f.set('kind',rule.kind);f.set('id',rule.id);f.set('expected',rule.value);submit(f,()=>setEditing(null));}}><fieldset disabled={pending}><label>Edit {rule.kind==='domain'?'domain':'email'}<input name="value" type={rule.kind==='email'?'email':'text'} defaultValue={rule.value} required maxLength={254} autoFocus autoCapitalize="none" spellCheck={false}/></label><div className="signup-row-actions"><button className="button">Save changes</button><button className="button" type="button" onClick={()=>setEditing(null)}>Cancel</button></div></fieldset></form>:<div className="signup-rule-row"><strong>{rule.value}</strong><div className="signup-row-actions"><button className="button" disabled={pending} aria-label={`Edit ${rule.value}`} onClick={()=>{setEditing(rule);setRemoving(null);}}>Edit</button><button className="button" disabled={pending} aria-label={`Remove ${rule.value}`} onClick={()=>{setRemoving(rule);setEditing(null);}}>Remove</button></div></div>}
    {removing?.id===rule.id&&<div className="signup-removal" role="group" aria-label={`Confirm removal of ${rule.value}`}><p>Remove <strong>{rule.value}</strong>? {rule.kind==='domain'?'New users from this domain will need an individual email exception.':'This address will need a matching allowed domain to sign up.'} Existing accounts stay active.</p><div className="signup-row-actions"><button className="button" disabled={pending} onClick={()=>{const f=new FormData();Object.entries({action:'delete',kind:rule.kind,id:rule.id,expected:rule.value,confirm:'yes'}).forEach(([k,v])=>f.set(k,v));submit(f,()=>setRemoving(null));}}>Confirm removal</button><button className="button" disabled={pending} onClick={()=>setRemoving(null)}>Cancel</button></div></div>}
   </li>)}</ul>
   {!visible.length&&<p className="empty-state">{query?'No matching rules.':kind==='domain'?'No domains allowed yet. Add a domain or use individual email exceptions.':'No email exceptions yet. Add one to let someone outside the allowed domains sign up.'}</p>}
   
  </div><aside className="signup-check"><h3>Check an email</h3><p>Preview eligibility for a new account using the saved rules.</p><form className="operation-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);f.set('action','check');f.set('kind','email');setCheck('');submit(f);}}><fieldset disabled={pending}><label>Email to check<input name="value" type="email" required maxLength={254} placeholder="person@example.com" onChange={()=>setCheck('')}/></label><button className="button">Check eligibility</button></fieldset></form>{check&&<p role="status" className="form-message">{check}</p>}<small>Existing users may still sign in even if this check says no. Removing a rule does not suspend accounts.</small></aside></div>
 </section>;
}
