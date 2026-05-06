import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "PostLiminal",
  description: "Agent-native generative canvas prototype",
  icons: {
    icon: "/brand/postliminal-logo.png",
    apple: "/brand/postliminal-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
