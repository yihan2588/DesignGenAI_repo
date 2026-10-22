import type { Metadata } from "next";
import "./globals.css";import "./admin.css";
export const metadata:Metadata={title:"HumorLLM · Control Room",description:"Private experiment administration"};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
