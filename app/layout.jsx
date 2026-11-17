import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata = {
  title: "WARP Config Manager",
  description: "Manage the media stack's Cloudflare WARP WireGuard configuration",
  icons: { icon: "/jellyfin-icon.svg", shortcut: "/jellyfin-icon.svg" },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#070b14", color: "#f7fafc" }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

