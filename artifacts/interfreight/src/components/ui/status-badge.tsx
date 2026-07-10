import { cn } from "@/lib/utils";

type Status = "In Transit" | "Delivered" | "Awaiting Clearance" | "At Port" | "Delayed" | string;

export function StatusBadge({ status, className }: { status: Status, className?: string }) {
  let colorClass = "bg-gray-100 text-gray-800 border-gray-200";
  const normalized = String(status ?? "").toLowerCase();

  if (normalized.includes("delivered")) {
    colorClass = "bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-200 dark:border-green-900";
  } else if (normalized.includes("clearance")) {
    colorClass = "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/40 dark:text-orange-200 dark:border-orange-900";
  } else if (normalized.includes("delay") || normalized.includes("problem") || normalized.includes("hold")) {
    colorClass = "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-200 dark:border-red-900";
  } else if (normalized.includes("transit") || normalized.includes("enroute") || normalized.includes("sea") || normalized.includes("pod") || normalized.includes("port")) {
    colorClass = "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-900";
  } else if (normalized.includes("draft") || normalized.includes("archived") || normalized.includes("completed")) {
    colorClass = "bg-gray-100 text-gray-800 border-gray-200 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-700";
  }

  return (
    <span className={cn("px-2.5 py-1 rounded-full text-xs font-semibold border", colorClass, className)}>
      {status}
    </span>
  );
}
