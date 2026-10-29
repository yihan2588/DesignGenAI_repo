import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/app/site-header";
export default function MissingMeme() { return <div className="cw-app"><SiteHeader/><main id="main-content" className="funny-empty"><h1>This meme isn’t available.</h1><p>It may be private, removed, or no longer shared.</p><Link className="cw-primary" href="/">Find another in the gallery</Link></main><SiteFooter/></div>; }
