import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { tengri } from "@/content/tengri";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "Tengri",
  description: tengri.description,
  icons: { icon: "/tengri/favicon.svg" },
  openGraph: {
    title: "Tengri",
    description: tengri.description,
    type: "website",
    images: [{ url: "/tengri/plant-preview.webp", width: 1600, height: 1000 }],
  },
  twitter: { card: "summary_large_image", title: "Tengri", description: tengri.description, images: ["/tengri/plant-preview.webp"] },
};

export const viewport: Viewport = { themeColor: "#000000" };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className="js">
      <head>
        <link rel="stylesheet" href="/fonts/fonts.css" />
      </head>
      <body id="top" suppressHydrationWarning>{children}</body>
    </html>
  );
}
