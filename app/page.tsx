import Link from "next/link";
import { getUser } from "@/lib/auth";
import { signOut } from "@/app/auth/actions";
import { Cowriter } from "@/app/cowriter/cowriter";
import "./cowriter/cowriter.css";
export const dynamic="force-dynamic";
export default async function Home({searchParams}:{searchParams:Promise<{mode?:string;draft?:string}>}){
 const [user,params]=await Promise.all([getUser(),searchParams]);
 return <div className="cw-app"><header className="cw-header"><Link className="cw-brand" href="/">FunnyLLM<span>Co-writer</span></Link><nav aria-label="Main navigation"><Link href="/compare">Compare</Link>{user?<form action={signOut}><button className="cw-link">Sign out</button></form>:<Link href="/login?next=/">Sign in</Link>}</nav></header><main id="main-content"><Cowriter signedIn={!!user} initialMode={params.mode==='thought'?'thought':'pic'} initialDraft={params.draft}/></main><footer className="cw-footer"><span>A picture. A thought. Your sense of humor.</span><Link href="/privacy">Privacy & how it works</Link></footer></div>;
}
