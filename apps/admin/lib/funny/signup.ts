export type SignupRule = { id: string; kind: 'domain' | 'email'; value: string; updated_at: string };
const domainPattern = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/;
export function normalizeSignupValue(kind: string, raw: unknown): string {
 if(typeof raw!=='string') throw new Error('Enter a domain or email address.');
 const value=raw.trim().toLowerCase();
 if(kind==='domain' && value.length<=253 && domainPattern.test(value)) return value;
 if(kind==='email'){
  const parts=value.split('@'),local=parts[0];
  if(value.length<=254&&parts.length===2&&local.length<=64&&/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)&&!local.startsWith('.')&&!local.endsWith('.')&&!local.includes('..')&&domainPattern.test(parts[1]))return value;
 }
 throw new Error(kind==='domain'?'Enter a domain such as columbia.edu, without @, a URL, or wildcards.':'Enter a complete email address such as guest@example.com.');
}
