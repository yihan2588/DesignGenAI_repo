import Link from "next/link";

export default function NotFound() {
  return <main className="admin-login" id="main-content"><Link className="brand" href="/admin">FunnyLLM<span>Admin</span></Link><h1>This page is no longer available.</h1><p>Manage the gallery and Funny Lab from the current admin workspace.</p><Link className="button primary" href="/admin">Back to overview</Link></main>;
}
