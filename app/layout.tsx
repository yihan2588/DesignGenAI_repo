import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HumorLLM — One image. Two captions. Your call.",
  description: "Two AI captions for the same image. Choose what lands, then see how everyone voted.",
  formatDetection: { email: false, telephone: false, address: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><a className="skip-link" href="#main-content">Skip to content</a>{children}</body></html>;
}
