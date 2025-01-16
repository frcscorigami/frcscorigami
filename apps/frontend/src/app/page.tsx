"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

const BASE_API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://us-central1-frc-scorigami.cloudfunctions.net/function-get";

const YEARS = [
  2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012,
  2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2022, 2023, 2024,
];

const DEFAULT_YEAR = 2024;

async function fetchData(year: number) {
  const response = await fetch(`${BASE_API_URL}/${year}`);
  if (!response.ok) {
    throw new Error("Network response was not ok");
  }
  return response.json();
}

export default function Home() {
  const [year, setYear] = useState(DEFAULT_YEAR);

  const { data, error, isLoading } = useQuery({
    queryKey: [year],
    queryFn: () => fetchData(year),
  });

  // if (isLoading) return <p>Loading...</p>;

  // if (error) return <p>Error: {error.message}</p>;

  return (
    <div className="">
      <Select onValueChange={(value) => setYear(Number(value))}>
        <SelectTrigger className="w-1/4">
          <SelectValue placeholder={DEFAULT_YEAR.toString()} />
        </SelectTrigger>
        <SelectContent>
          {YEARS.toReversed().map((year) => (
            <SelectItem key={year} value={year.toString()}>
              {year}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <h1>Page</h1>
      {isLoading && <p>Loading...</p>}
      {error && <p>Error: {error.message}</p>}
      {data && <pre>{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );
}
