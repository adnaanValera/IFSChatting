import { cn } from "@/lib/utils"

function Spinner({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn("relative inline-flex aspect-square size-[9rem] sm:size-[6rem] items-center justify-center", className)}
      {...props}
    >
      <video
        className="h-full w-full object-cover"
        src="/ifs-loader.mp4"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
      />
    </div>
  )
}

export { Spinner }
