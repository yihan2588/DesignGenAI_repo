export type GalleryPost = {
  id: string; caption: string; alt: string; width: number; height: number;
  author_name: string; featured: boolean; like_count: number; liked: boolean; saved: boolean;
  status: "published" | "unpublished" | "removed"; created_at: string; owned: boolean;
};
export type GalleryResult = { posts: GalleryPost[]; more: boolean };
export type GalleryFilter = "latest" | "featured" | "mine" | "saved";
