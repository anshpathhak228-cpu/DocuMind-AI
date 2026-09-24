import "./globals.css";
import type {Metadata} from "next";
export const metadata:Metadata={title:"DocAI",description:"Secure document storage and AI assistant"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
