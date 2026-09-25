import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "At the Table — A Food Photo Journal",
  description: "A collection of food photos and good memories by Yihan Wu.",
  formatDetection: { email: false, telephone: false, address: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><a className="skip-link" href="#main-content">Skip to content</a>{children}</body></html>;
}
