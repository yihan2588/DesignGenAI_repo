import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/app/site-header";

export default function NotFound() {
  return <div className="cw-app"><SiteHeader/><main id="main-content" className="funny-empty"><h1>This page isn’t available.</h1><p>Find a meme in the gallery, or make your own in Funny Lab.</p><Link className="cw-primary" href="/">Open the gallery</Link><p><Link className="cw-link" href="/lab">Open Funny Lab</Link></p></main><SiteFooter/></div>;
}
