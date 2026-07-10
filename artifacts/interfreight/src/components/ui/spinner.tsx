import miniLogoUrl from "@assets/IFS_mini_logo.png"

import { cn } from "@/lib/utils"

function Spinner({ className, ...props }: React.ComponentProps<"img">) {
  return (
    <img
      src={miniLogoUrl}
      alt="Loading"
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-[spin_1.05s_linear_infinite_reverse] object-contain", className)}
      {...props}
    />
  )
}

export { Spinner }
