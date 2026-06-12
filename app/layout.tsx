import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ 
  subsets: ["latin"],
  display: 'swap', // Verbessert Ladezeit (Text sofort sichtbar)
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: "RankedDarts – Competitive Darts Matchmaking",
  description: "Finde faire Gegner, spiele bestätigte Matches und klettere mit einem transparenten Elo-System durch die RankedDarts-Leaderboards.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "RankedDarts",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#050607",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de" className={`${inter.variable}`}>
      <body className="bg-[#020304] text-zinc-100 font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}