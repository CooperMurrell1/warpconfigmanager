import { Providers } from "@/components/providers";

export const metadata = {
  title: "WARP Config Manager",
  description: "Manage the media stack's Cloudflare WARP WireGuard configuration",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
