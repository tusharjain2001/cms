import type { Metadata } from "next";
import { AuthProvider } from "@/lib/auth";
import { StoreProvider } from "@/lib/store";
import { MediaProvider } from "@/lib/media";
import { AppChrome } from "@/components/app-chrome";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pagecraft",
  description: "Edit the words and photos on your website.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Karla:ital,wght@0,400;0,500;0,600;0,700;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AuthProvider>
          <StoreProvider>
            <MediaProvider>
              {children}
              <AppChrome />
            </MediaProvider>
          </StoreProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
