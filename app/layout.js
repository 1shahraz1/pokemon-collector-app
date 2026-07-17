import "./globals.css";

export const metadata = {
  title: "Collector Challenges",
  description: "Daily challenges, points, and prize giveaways for Pokemon card collectors.",
  manifest: "/manifest.json",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#111111",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
