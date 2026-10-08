import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.rankeddarts.de"),
  title: {
    default: "RankedDarts – Competitive Darts Matchmaking",
    template: "%s · RankedDarts",
  },
  description: "Spiele über Scolia, DartCounter oder AutoDarts, finde faire Gegner und klettere mit bestätigten Matches durch das RankedDarts-Leaderboard.",
  keywords: ["Darts", "Dart Matchmaking", "Scolia", "DartCounter", "AutoDarts", "Elo Ranking", "Dart Turniere"],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "de_DE",
    url: "https://www.rankeddarts.de/",
    siteName: "RankedDarts",
    title: "RankedDarts – Dein nächstes Darts-Match",
    description: "Faire 1v1-Duelle über Scolia, DartCounter oder AutoDarts. Ergebnis bestätigen, Elo sammeln, aufsteigen.",
    images: [{
      url: "/rankeddarts-darts-club-hero-v2.png",
      width: 1672,
      height: 941,
      alt: "RankedDarts – Competitive Darts Matchmaking",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "RankedDarts – Dein nächstes Darts-Match",
    description: "Faire Darts-Matches über Scolia, DartCounter oder AutoDarts.",
    images: ["/rankeddarts-darts-club-hero-v2.png"],
  },
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
    <html lang="de">
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
