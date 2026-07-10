import { useState } from "react";
import { Link } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
import { LayoutDashboard, LogIn, Menu, X, MapPin } from "lucide-react";
import miniLogoUrl from "@assets/IFS_mini_logo.png";
import { NotificationBell } from "./NotificationBell";

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: user } = useGetMe();

  const typedUser = user as any;
  const role = typedUser?.role;
  const isCustomer = !!user && role !== "staff" && role !== "admin";
  const dashboardHref = role === "staff" || role === "admin" ? "/staff/dashboard" : "/dashboard";

  return (
    <nav className="fixed top-0 inset-x-0 z-50 bg-secondary/95 backdrop-blur-md border-b border-white/10 shadow-lg">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link href="/">
            <img
              src={miniLogoUrl}
              alt="InterFreight"
              className="h-11 w-11 object-contain cursor-pointer"
            />
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-8">
            <a href="/" className="text-sm font-medium text-white/65 hover:text-primary transition-colors">
              Home
            </a>
            <a href="/#services" className="text-sm font-medium text-white/65 hover:text-primary transition-colors">
              Services
            </a>
            <a href="/#contact" className="text-sm font-medium text-white/65 hover:text-primary transition-colors">
              Contact
            </a>
            {/* My Tracking — only shown when logged in as a customer */}
            {isCustomer && (
              <Link
                href="/dashboard"
                className="text-sm font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1.5 font-semibold"
              >
                <MapPin size={14} />
                My Tracking
              </Link>
            )}
          </div>

          {/* Right: notification bell + auth CTA */}
          <div className="hidden md:flex items-center gap-3">
            {isCustomer && <NotificationBell />}
            {user ? (
              <Link
                href={dashboardHref}
                className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-all shadow"
              >
                <LayoutDashboard size={15} />
                My Dashboard
              </Link>
            ) : (
              <Link
                href="/auth"
                className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-all shadow"
              >
                <LogIn size={15} />
                Client Login
              </Link>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden text-white p-2 rounded"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="md:hidden bg-secondary border-t border-white/10 px-4 py-4 space-y-1">
          <a
            href="/"
            className="block text-sm font-medium text-white/70 hover:text-primary py-2.5 px-2 rounded"
            onClick={() => setMobileOpen(false)}
          >
            Home
          </a>
          <a
            href="/#services"
            className="block text-sm font-medium text-white/70 hover:text-primary py-2.5 px-2 rounded"
            onClick={() => setMobileOpen(false)}
          >
            Services
          </a>
          <a
            href="/#contact"
            className="block text-sm font-medium text-white/70 hover:text-primary py-2.5 px-2 rounded"
            onClick={() => setMobileOpen(false)}
          >
            Contact
          </a>
          {isCustomer && (
            <Link
              href="/dashboard"
              className="block text-sm font-semibold text-primary py-2.5 px-2 rounded flex items-center gap-2"
              onClick={() => setMobileOpen(false)}
            >
              <MapPin size={14} />
              My Tracking
            </Link>
          )}
          <div className="pt-3">
            {user ? (
              <Link
                href={dashboardHref}
                className="block text-center bg-primary text-white text-sm font-semibold px-4 py-3 rounded-lg"
                onClick={() => setMobileOpen(false)}
              >
                My Dashboard
              </Link>
            ) : (
              <Link
                href="/auth"
                className="block text-center bg-primary text-white text-sm font-semibold px-4 py-3 rounded-lg"
                onClick={() => setMobileOpen(false)}
              >
                Client Login
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
