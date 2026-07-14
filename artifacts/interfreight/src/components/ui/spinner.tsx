import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

function Spinner({ className, ...props }: React.ComponentProps<"div">) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (!context) return

    let frameId = 0

    const drawFrame = () => {
      if (!video.videoWidth || !video.videoHeight) {
        frameId = window.requestAnimationFrame(drawFrame)
        return
      }

      const size = 360
      if (canvas.width !== size || canvas.height !== size) {
        canvas.width = size
        canvas.height = size
      }

      const scale = Math.max(size / video.videoWidth, size / video.videoHeight)
      const drawWidth = video.videoWidth * scale
      const drawHeight = video.videoHeight * scale
      const dx = (size - drawWidth) / 2
      const dy = (size - drawHeight) / 2

      context.clearRect(0, 0, size, size)
      context.drawImage(video, dx, dy, drawWidth, drawHeight)

      const frame = context.getImageData(0, 0, size, size)
      const data = frame.data
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i] ?? 0
        const g = data[i + 1] ?? 0
        const b = data[i + 2] ?? 0

        const greenDominant = g > 110 && g > r * 1.25 && g > b * 1.2
        if (greenDominant) {
          const excessGreen = g - Math.max(r, b)
          const alpha = Math.max(0, Math.min(255, 255 - excessGreen * 2.2))
          data[i + 3] = alpha < 90 ? 0 : alpha
        }
      }

      context.putImageData(frame, 0, 0)
      frameId = window.requestAnimationFrame(drawFrame)
    }

    const onPlay = () => {
      window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(drawFrame)
    }

    video.addEventListener("play", onPlay)
    if (!video.paused) {
      onPlay()
    } else {
      const startPlayback = async () => {
        try {
          await video.play()
        } catch {
          // Ignore autoplay errors; the canvas will start when playback begins.
        }
      }
      void startPlayback()
    }

    return () => {
      window.cancelAnimationFrame(frameId)
      video.removeEventListener("play", onPlay)
    }
  }, [])

  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn("relative inline-flex aspect-square size-[12rem] sm:size-[5rem] items-center justify-center", className)}
      {...props}
    >
      <video
        ref={videoRef}
        className="hidden"
        src="/ifs-loader.mp4"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
      />
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        aria-hidden="true"
      />
    </div>
  )
}

export { Spinner }
