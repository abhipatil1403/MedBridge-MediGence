import type { Metadata } from "next";
import { PublicChrome } from "@/components/public-chrome";
import "./globals.css";
import "./product.css";
import "./ui-system.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: { default: "MedBridge | A clearer path through care", template: "%s | MedBridge" },
  description: "MedBridge is building a connected platform for healthcare discovery, treatment coordination, and recovery.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <PublicChrome position="header" />
        {children}
        <PublicChrome position="footer" />
      </body>
    </html>
  );
}
