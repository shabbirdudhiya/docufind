import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "DocuFind - Local Document Search",
  description: "Search through your local documents instantly. Built by Shabbir Dudhiya",
  keywords: ["Document Search", "Local Search", "Electron", "Next.js", "TypeScript", "Desktop App"],
  authors: [{ name: "Shabbir Dudhiya" }],
  icons: {
    icon: "/icon.svg",
  },
  openGraph: {
    title: "DocuFind",
    description: "A powerful desktop app for searching through local documents instantly",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="antialiased bg-background text-foreground font-sans"
        suppressHydrationWarning
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
