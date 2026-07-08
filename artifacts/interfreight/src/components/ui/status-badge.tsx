import { cn } from "@/lib/utils";

type Status = "In Transit" | "Delivered" | "Awaiting Clearance" | "At Port" | "Delayed" | string;

export function StatusBadge({ status, className }: { status: Status, className?: string }) {
  let colorClass = "bg-gray-100 text-gray-800 border-gray-200";
  
  switch(status) {
    case "Delivered":
      colorClass = "bg-green-100 text-green-800 border-green-200";
      break;
    case "In Transit":
      colorClass = "bg-blue-100 text-blue-800 border-blue-200";
      break;
    case "Awaiting Clearance":
      colorClass = "bg-amber-100 text-amber-800 border-amber-200";
      break;
    case "At Port":
      colorClass = "bg-indigo-100 text-indigo-800 border-indigo-200";
      break;
    case "Delayed":
      colorClass = "bg-red-100 text-red-800 border-red-200";
      break;
  }

  return (
    <span className={cn("px-2.5 py-1 rounded-full text-xs font-semibold border", colorClass, className)}>
      {status}
    </span>
  );
}
