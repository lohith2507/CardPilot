import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ServiceWorkerRegistrar } from "@/components/service-worker";
import { TabBar } from "@/components/tab-bar";
import "./globals.css";

/** One family throughout, with tabular figures where numbers are compared. */
const body = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "CardPilot",
  description:
    "Compare the cards in your wallet for a purchase using the earn rules you saved. Estimates only. Confirm rates with your issuer.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "CardPilot" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={body.variable}>
      <body className="min-h-dvh antialiased">
        <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
          <main className="flex-1 px-4 pb-32 pt-6">{children}</main>
          <TabBar />
        </div>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
