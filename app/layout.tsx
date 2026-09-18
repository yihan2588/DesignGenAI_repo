import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Yihan Wu — Hello, World",
  description: "Yihan Wu, an Electrical Engineering graduate student at Columbia University focused on AI engineering. View my résumé and get in touch.",
  formatDetection: { email: false, telephone: false, address: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><a className="skip-link" href="#main-content">Skip to content</a>{children}</body></html>;
}
