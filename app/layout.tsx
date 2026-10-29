import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FunnyLLM — Make a meme worth keeping.",
  description: "Start with a picture or a thought. Find a funny angle, refine it, and make it yours.",
  formatDetection: { email: false, telephone: false, address: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><a className="skip-link" href="#main-content">Skip to content</a>{children}</body></html>;
}
