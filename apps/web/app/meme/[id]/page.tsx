import Link from "next/link";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/auth";
import { isUuid } from "@/lib/navigation";
import { SiteHeader, SiteFooter } from "@/app/site-header";
import { galleryFeed } from "@/app/gallery/feed-data";
import { PostCard } from "@/app/gallery/post-card";
export const dynamic = "force-dynamic";
export const metadata = { title: "A meme worth sharing — FunnyLLM" };
export default async function Meme({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!isUuid(id)) notFound();
  const user = await getUser(), result = await galleryFeed("latest",1,"",id), post = result.posts[0];
  if (!post) notFound();
  return <div className="cw-app"><SiteHeader active="gallery"/><main id="main-content" className="funny-meme-page"><Link className="cw-link" href="/">Back to the gallery</Link><h1 className="cw-sr">A meme by {post.author_name}</h1><PostCard post={post} signedIn={!!user} detail/></main><SiteFooter/></div>;
}
