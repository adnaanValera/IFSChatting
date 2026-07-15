import { useState } from "react";
import { Send } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";

type ProblemCategory = "notification" | "glitch" | "other";

function authFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem("intf_token");
  return fetch(path, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

export function ProblemReporter() {
  const { toast } = useToast();
  const [problemCategory, setProblemCategory] = useState<ProblemCategory>("notification");
  const [problemMessage, setProblemMessage] = useState("");
  const [problemSending, setProblemSending] = useState(false);
  const [problemSent, setProblemSent] = useState(false);

  const handleSubmitProblem = async () => {
    if (!problemMessage.trim()) {
      toast({
        variant: "destructive",
        title: "Please describe the problem",
        description: "Tell us what is going wrong so we can fix it quickly.",
      });
      return;
    }

    setProblemSending(true);
    try {
      const response = await authFetch("/api/customer/problems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: problemCategory,
          message: problemMessage.trim(),
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Problem could not be sent");
      }

      setProblemSent(true);
      setProblemMessage("");
      setProblemCategory("notification");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not send problem",
        description: error?.message || "Please try again.",
      });
    } finally {
      setProblemSending(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm glow-card p-4 sm:p-5">
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-[0.2em]">Support</p>
          <h3 className="text-xl font-extrabold text-secondary dark:text-white mt-1">Bug/Problem</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Let us know if something is wrong and we will check it right away.
          </p>
        </div>

        {problemSent ? (
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5 text-center">
            <video
              src="/ifs-loader.mp4"
              autoPlay
              muted
              loop
              playsInline
              className="mx-auto h-28 w-28 bg-transparent object-contain mix-blend-darken sm:h-36 sm:w-36"
            />
            <p className="mt-3 text-sm font-semibold text-secondary dark:text-white">
              As soon as we see your message we will work on it right away.
            </p>
            <button
              type="button"
              onClick={() => setProblemSent(false)}
              className="mt-4 inline-flex items-center justify-center rounded-xl border border-primary/20 bg-white px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/5"
            >
              Send another
            </button>
          </div>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              {(["notification", "glitch", "other"] as ProblemCategory[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setProblemCategory(option)}
                  className={`rounded-xl border px-4 py-3 text-sm font-semibold text-left transition-all ${
                    problemCategory === option
                      ? "border-primary bg-primary/10 text-primary shadow-sm"
                      : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-secondary"
                  }`}
                >
                  {option === "notification" ? "Notification" : option === "glitch" ? "Glitch" : "Other"}
                </button>
              ))}
            </div>

            <textarea
              value={problemMessage}
              onChange={(event) => setProblemMessage(event.target.value)}
              rows={4}
              placeholder="Tell us what happened..."
              className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
            />

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void handleSubmitProblem()}
                disabled={problemSending || !problemMessage.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {problemSending ? <Spinner className="w-4 h-4" /> : <Send size={16} />}
                Send problem
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
