import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock, Mail, Loader2, ArrowRight, User, Building2, Phone, Clock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import logoUrl from "@assets/Inter_freight_logo_1782979832903.jpeg";

// ── Schemas ───────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
  sessionDays: z.coerce.number().pipe(z.union([z.literal(1), z.literal(7), z.literal(30), z.literal(90), z.literal(180)])),
});

const registerSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  companyName: z.string().min(1, "Company name is required"),
  phoneNumber: z.string().min(6, "Phone number is required"),
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginValues = z.infer<typeof loginSchema>;
type RegisterValues = z.infer<typeof registerSchema>;

// ── Shared input style ────────────────────────────────────────────────────────

function FieldInput({
  icon: Icon,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  icon: React.ElementType;
  error?: string;
}) {
  return (
    <div>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <input
          {...props}
          className={`block w-full pl-10 pr-3 py-2.5 border ${error ? "border-destructive" : "border-input"} rounded-md focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm`}
        />
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ── Login Form ────────────────────────────────────────────────────────────────

function LoginForm({ onSuccess }: { onSuccess: (user: any) => void }) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { sessionDays: 30 },
  });

  const onSubmit = async (data: LoginValues) => {
    setIsLoading(true);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Invalid credentials");
      localStorage.setItem("intf_token", json.token);
      localStorage.setItem("intf_session_duration_confirmed", "1");
      onSuccess(json.user);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Login failed", description: err?.message || "Invalid credentials" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
      <FieldInput
        icon={Mail}
        type="email"
        placeholder="your@email.com"
        error={form.formState.errors.email?.message}
        {...form.register("email")}
      />
      <FieldInput
        icon={Lock}
        type="password"
        placeholder="••••••••"
        error={form.formState.errors.password?.message}
        {...form.register("password")}
      />
      <div>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Clock className="h-5 w-5 text-muted-foreground" />
          </div>
          <select
            {...form.register("sessionDays")}
            className="block w-full pl-10 pr-3 py-2.5 border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm bg-white"
          >
            <option value={1}>Stay signed in for today</option>
            <option value={7}>Stay signed in for 7 days</option>
            <option value={30}>Stay signed in for 30 days</option>
            <option value={90}>Stay signed in for 90 days</option>
            <option value={180}>Stay signed in for 180 days</option>
          </select>
        </div>
      </div>
      <button
        type="submit"
        disabled={isLoading}
        className="w-full flex justify-center items-center gap-2 py-3 px-4 bg-primary hover:bg-primary/90 text-white font-semibold rounded-md transition-colors disabled:opacity-60"
      >
        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><span>Sign In</span><ArrowRight size={16} /></>}
      </button>
    </form>
  );
}

// ── Register Form ─────────────────────────────────────────────────────────────

function RegisterForm({ onSuccess }: { onSuccess: (user: any) => void }) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [pendingMessage, setPendingMessage] = useState("");
  const form = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });
  const [, setLocation] = useLocation();

  const onSubmit = async (data: RegisterValues) => {
    setIsLoading(true);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Registration failed");
      if (res.status === 202 || json.status === "pending") {
        if (json.approvalToken) {
          localStorage.setItem("intf_pending_signup_token", json.approvalToken);
          localStorage.setItem("intf_pending_signup_email", json.email || data.email);
          setLocation("/auth/waiting");
          return;
        }
        setPendingMessage(json.message || "Your signup request has been sent. Please wait for staff approval.");
        form.reset();
        return;
      }
      localStorage.setItem("intf_token", json.token);
      onSuccess(json.user);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Registration failed", description: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
      {pendingMessage && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {pendingMessage}
        </div>
      )}
      <FieldInput
        icon={User}
        type="text"
        placeholder="Full Name"
        error={form.formState.errors.fullName?.message}
        {...form.register("fullName")}
      />
      <FieldInput
        icon={Building2}
        type="text"
        placeholder="Company Name"
        error={form.formState.errors.companyName?.message}
        {...form.register("companyName")}
      />
      <FieldInput
        icon={Phone}
        type="tel"
        placeholder="Phone Number"
        error={form.formState.errors.phoneNumber?.message}
        {...form.register("phoneNumber")}
      />
      <FieldInput
        icon={Mail}
        type="email"
        placeholder="your@email.com"
        error={form.formState.errors.email?.message}
        {...form.register("email")}
      />
      <FieldInput
        icon={Lock}
        type="password"
        placeholder="Password (min 6 characters)"
        error={form.formState.errors.password?.message}
        {...form.register("password")}
      />
      <button
        type="submit"
        disabled={isLoading}
        className="w-full flex justify-center items-center gap-2 py-3 px-4 bg-primary hover:bg-primary/90 text-white font-semibold rounded-md transition-colors disabled:opacity-60"
      >
        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><span>Create Account</span><ArrowRight size={16} /></>}
      </button>
    </form>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AuthPage() {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const handleSuccess = (user: any) => {
    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    if (user.role === "staff") {
      setLocation("/staff/dashboard");
    } else {
      setLocation("/dashboard");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <img src={logoUrl} alt="InterFreight Logo" className="h-16 w-auto bg-white rounded p-1 shadow-sm mx-auto mb-4" />
        <h2 className="text-3xl font-extrabold text-secondary">
          {tab === "login" ? "Sign In to Your Account" : "Create an Account"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {tab === "login" ? "Track your shipments and reports" : "Register to access your company's reports"}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-xl rounded-lg border border-border">
          {/* Tab Toggle */}
          <div className="flex rounded-md bg-muted p-1 mb-6">
            <button
              type="button"
              onClick={() => setTab("login")}
              className={`flex-1 py-2 text-sm font-medium rounded transition-colors ${tab === "login" ? "bg-white text-secondary shadow-sm" : "text-muted-foreground hover:text-secondary"}`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setTab("register")}
              className={`flex-1 py-2 text-sm font-medium rounded transition-colors ${tab === "register" ? "bg-white text-secondary shadow-sm" : "text-muted-foreground hover:text-secondary"}`}
            >
              Sign Up
            </button>
          </div>

          {tab === "login" ? (
            <LoginForm onSuccess={handleSuccess} />
          ) : (
            <RegisterForm onSuccess={handleSuccess} />
          )}
        </div>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          <a href="/" className="text-primary hover:underline">← Back to home</a>
        </p>
      </div>
    </div>
  );
}
