"use client";

import "@/app/globals.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";

const font = Inter({
  subsets: ["latin"],
  display: "swap",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <html lang="en">
      <body className="">
        <QueryClientProvider client={queryClient}>
          <div className={cn("", font.className)}>
            {children}
          </div>
        </QueryClientProvider>
      </body>
    </html>
  );
}
