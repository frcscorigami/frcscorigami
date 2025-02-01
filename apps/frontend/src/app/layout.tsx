"use client";

import "@/app/globals.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

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
          <div className="container mx-auto">{children}</div>
        </QueryClientProvider>
      </body>
    </html>
  );
}
