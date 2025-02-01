"use client";

import { DataTable } from "@/components/data-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, range, timeSince } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import { PacmanLoader } from "react-spinners";
import { useMemo, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export interface ApiResponse {
  data: Datum[];
}

export interface Datum {
  count: number;
  first: MatchInfo;
  losing_score: number;
  winning_score: number;
}

export interface MatchInfo {
  actual_time: number | null;
  key: string;
  losing_alliance: number[];
  winning_alliance: number[];
  winning_color: "red" | "blue";
}

const BASE_API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://us-central1-frc-scorigami.cloudfunctions.net/function-get";

const YEARS = [
  2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012,
  2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2022, 2023, 2024, 2025,
];

const DEFAULT_YEAR = 2024;

async function fetchData(year: number): Promise<ApiResponse> {
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

  const [enableHeatmap, setEnableHeatmap] = useState(false);

  return (
    <div className="">
      <div className="text-5xl font-bold text-gray-700 text-center my-4">
        FRC Scorigami
      </div>

      <div className="flex flex-row justify-center gap-6 items-center mb-4">
        <Select onValueChange={(value) => setYear(Number(value))}>
          <SelectTrigger className="w-auto">
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

        <div className="flex flex-row items-center gap-2">
          <Switch
            id="heatmap-mode"
            onCheckedChange={setEnableHeatmap}
            checked={enableHeatmap}
          />
          <Label htmlFor="heatmap-mode">Heatmap Mode</Label>
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center min-h-[90vh] items-center">
          <PacmanLoader speedMultiplier={2} />
        </div>
      )}
      {error && <p>Error: {error.message}</p>}

      {data && (
        <ScorigamiTable data={data.data} enableHeatmap={enableHeatmap} />
      )}

      {data && (
        <div className="flex flex-row flex-wrap md:flex-nowrap gap-4 mt-4 [&>div]:basis-1/2 justify-center">
          <div className="md:max-w-[50%]">
            <div className="text-3xl font-bold text-gray-700">
              Most Recent Scorigamis
            </div>
            <MostRecentScorigamis
              data={data.data.toSorted(
                (a, b) =>
                  (b.first.actual_time ?? 0) - (a.first.actual_time ?? 0)
              )}
            />
          </div>

          <div className="md:max-w-[50%]">
            <div className="text-3xl font-bold text-gray-700">
              Most Common Scores
            </div>
            <MostCommonScores
              data={data.data.toSorted((a, b) => b.count - a.count)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ScorigamiTable({
  data,
  enableHeatmap,
}: {
  data: Datum[];
  enableHeatmap: boolean;
}) {
  const maxCols = useMemo(
    () =>
      data.reduce((max, { losing_score }) => Math.max(max, losing_score), 0),
    [data]
  );

  const maxRows = useMemo(
    () =>
      data.reduce((max, { winning_score }) => Math.max(max, winning_score), 0),
    [data]
  );

  const maxCount = useMemo(
    () => data.reduce((max, { count }) => Math.max(max, count), 0),
    [data]
  );

  return (
    <div className="overflow-scroll max-h-[75vh]">
      <table className="">
        <tbody>
          <tr>
            <td></td>
            {range(0, maxCols + 1).map((a) => (
              <td
                key={a}
                className="text-xs sticky top-0 group bg-black text-white"
              >
                {a}
              </td>
            ))}
          </tr>
          {range(0, maxRows + 1).map((a) => (
            <tr key={`${a}-row`} className="hover:bg-gray-400">
              <td className="text-xs sticky left-0 bg-black text-white">{a}</td>
              {range(0, Math.min(a + 1, maxCols)).map((b) => {
                const baseClasses = "min-w-3 h-3 aspect-square";

                const hasScorigami = data.find(
                  (sc) =>
                    (sc.losing_score === a && sc.winning_score === b) ||
                    (sc.losing_score === b && sc.winning_score === a)
                );

                if (hasScorigami === undefined) {
                  return (
                    <td key={`${a}-${b}-col`} className={baseClasses}></td>
                  );
                }

                if (!enableHeatmap) {
                  return (
                    <td
                      key={`${a}-${b}-col`}
                      className={cn(baseClasses, {
                        "bg-green-500": hasScorigami.count > 0,
                      })}
                    ></td>
                  );
                }

                const heatmapPct = hasScorigami.count / maxCount;

                return (
                  <td
                    key={`${a}-${b}-col`}
                    className={cn("min-w-3 h-3 aspect-square", {
                      "bg-green-100/70": 0 < heatmapPct && heatmapPct <= 0.1,
                      "bg-green-200/70": 0.1 < heatmapPct && heatmapPct <= 0.2,
                      "bg-green-300/70": 0.2 < heatmapPct && heatmapPct <= 0.3,
                      "bg-green-400/70": 0.3 < heatmapPct && heatmapPct <= 0.4,
                      "bg-green-500/70": 0.4 < heatmapPct && heatmapPct <= 0.5,
                      "bg-green-600/70": 0.5 < heatmapPct && heatmapPct <= 0.6,
                      "bg-green-700/70": 0.6 < heatmapPct && heatmapPct <= 0.7,
                      "bg-green-800/70": 0.7 < heatmapPct && heatmapPct <= 0.8,
                      "bg-green-900/70": 0.8 < heatmapPct && heatmapPct <= 0.9,
                      "bg-green-950/70": 0.9 < heatmapPct && heatmapPct <= 1,
                    })}
                  ></td>
                );
              })}
              {range(a + 2, maxCols + 1).map((b) => (
                <td key={`${a}-${b}-col`}></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MostCommonScores({ data }: { data: Datum[] }) {
  const columns: ColumnDef<Datum>[] = [
    {
      header: "Count",
      accessorFn: (d) => d.count,
    },
    {
      header: "Score",
      accessorFn: (d) => `${d.winning_score} - ${d.losing_score}`,
    },
    {
      header: "First",
      cell: (c) => (
        <div className="flex flex-col">
          <div
            className={cn("", {
              "text-red-500": c.row.original.first.winning_color === "red",
              "text-blue-500": c.row.original.first.winning_color === "blue",
            })}
          >
            {c.row.original.first.winning_alliance.join("-")}
          </div>
          <div
            className={cn("", {
              "text-red-500": c.row.original.first.winning_color === "blue",
              "text-blue-500": c.row.original.first.winning_color === "red",
            })}
          >
            {c.row.original.first.losing_alliance.join("-")}
          </div>
        </div>
      ),
    },
    {
      header: "First Match",
      cell: (c) => (
        <a
          href={`https://www.thebluealliance.com/match/${c.row.original.first.key}`}
          className="text-gray-600 underline"
        >
          {c.row.original.first.key}
        </a>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      // data={data.toSorted((a, b) => b.count - a.count)}
      data={data}
    />
  );
}

function MostRecentScorigamis({ data }: { data: Datum[] }) {
  const columns: ColumnDef<Datum>[] = [
    {
      header: "Score",
      accessorFn: (d) => `${d.winning_score} - ${d.losing_score}`,
    },
    {
      header: "When",
      accessorFn: (d) => timeSince(d.first.actual_time ?? 0),
    },
    {
      header: "Who",
      cell: (c) => (
        <div className="flex flex-col">
          <div
            className={cn("", {
              "text-red-500": c.row.original.first.winning_color === "red",
              "text-blue-500": c.row.original.first.winning_color === "blue",
            })}
          >
            {c.row.original.first.winning_alliance.join("-")}
          </div>
          <div
            className={cn("", {
              "text-red-500": c.row.original.first.winning_color === "blue",
              "text-blue-500": c.row.original.first.winning_color === "red",
            })}
          >
            {c.row.original.first.losing_alliance.join("-")}
          </div>
        </div>
      ),
    },
    {
      header: "Match",
      cell: (c) => (
        <a
          href={`https://www.thebluealliance.com/match/${c.row.original.first.key}`}
          className="text-gray-600 underline"
        >
          {c.row.original.first.key}
        </a>
      ),
    },
  ];

  return <DataTable columns={columns} data={data} />;
}
