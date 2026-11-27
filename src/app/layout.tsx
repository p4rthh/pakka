import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pakka: phone orders to pakka bills",
  description: "Voice-first order desk for Indian shops: phone calls become priced bills, packing slips and WhatsApp confirmations.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hi-Latn">
      <body>{children}</body>
    </html>
  );
}
