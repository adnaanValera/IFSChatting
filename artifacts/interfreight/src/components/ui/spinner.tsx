import { cn } from "@/lib/utils"

function Spinner({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn("ifs-loader relative inline-flex aspect-square size-5 items-center justify-center", className)}
      {...props}
    >
      <svg viewBox="0 0 120 120" className="ifs-loader__svg" aria-hidden="true">
        <defs>
          <linearGradient id="ifsLetterGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f4f4f4" />
            <stop offset="48%" stopColor="#aeb4bc" />
            <stop offset="100%" stopColor="#525861" />
          </linearGradient>
          <linearGradient id="ifsArcRed" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6f0b14" />
            <stop offset="38%" stopColor="#d31524" />
            <stop offset="100%" stopColor="#ff3d4e" />
          </linearGradient>
          <linearGradient id="ifsArcSilver" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f0f2f5" />
            <stop offset="44%" stopColor="#b2b8c0" />
            <stop offset="100%" stopColor="#59606b" />
          </linearGradient>
          <linearGradient id="ifsSweep" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(255,255,255,0)" />
            <stop offset="48%" stopColor="rgba(255,255,255,0.95)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
          <filter id="ifsArcGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="ifsLetterShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="rgba(0,0,0,0.28)" />
          </filter>
          <clipPath id="ifsLettersClip">
            <text x="60" y="72" textAnchor="middle" className="ifs-loader__text">IFS</text>
          </clipPath>
        </defs>

        <rect x="6" y="6" width="108" height="108" rx="24" className="ifs-loader__backdrop" />
        <ellipse cx="24" cy="28" rx="16" ry="20" className="ifs-loader__ambient ifs-loader__ambient--red" />
        <ellipse cx="90" cy="88" rx="22" ry="18" className="ifs-loader__ambient ifs-loader__ambient--silver" />

        <g filter="url(#ifsLetterShadow)">
          <text x="60" y="72" textAnchor="middle" className="ifs-loader__text ifs-loader__text-fill">IFS</text>
          <rect x="-50" y="30" width="36" height="60" fill="url(#ifsSweep)" className="ifs-loader__sweep" clipPath="url(#ifsLettersClip)" />
        </g>

        <g className="ifs-loader__orbit">
          <path
            d="M24 40 C39 17, 80 11, 100 36"
            fill="none"
            stroke="url(#ifsArcRed)"
            strokeWidth="9"
            strokeLinecap="round"
            filter="url(#ifsArcGlow)"
            className="ifs-loader__arc ifs-loader__arc--red"
          />
          <path
            d="M30 86 C48 102, 81 103, 100 82"
            fill="none"
            stroke="url(#ifsArcSilver)"
            strokeWidth="8"
            strokeLinecap="round"
            filter="url(#ifsArcGlow)"
            className="ifs-loader__arc ifs-loader__arc--silver"
          />
        </g>
      </svg>
    </div>
  )
}

export { Spinner }
