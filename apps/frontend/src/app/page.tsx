"use client";

import { useQuery } from "@tanstack/react-query";

const BASE_API_URL = process.env.NEXT_PUBLIC_API_URL;

async function fetchData() {
  const response = await fetch(`${BASE_API_URL}/2023`);
  if (!response.ok) {
    throw new Error("Network response was not ok");
  }
  return response.json();
}

export default function Home() {
  const { data, error, isLoading } = useQuery({
    queryKey: ["2023"],
    queryFn: fetchData,
  });

  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <div className="">
      <h1>Page</h1>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
