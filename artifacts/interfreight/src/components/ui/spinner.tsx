import { cn } from "@/lib/utils"

function Spinner({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn("relative inline-flex aspect-square size-4 items-center justify-center", className)}
      {...props}
    >
      <span className="absolute inset-[6%] rounded-full border-[1.5px] border-transparent border-t-primary/90 border-r-primary/55 animate-[spin_1.05s_linear_infinite_reverse]" />
      <span className="absolute inset-[16%] rounded-full border-[1.5px] border-transparent border-b-white/70 border-l-white/35 animate-[spin_1.25s_linear_infinite]" />
      <span className="relative text-[0.34em] font-extrabold tracking-[0.18em] text-white [text-shadow:0_0_8px_rgba(18,20,23,0.95),0_0_16px_rgba(18,20,23,0.75)]">IFS</span>
    </div>
  )
}

export { Spinner }
