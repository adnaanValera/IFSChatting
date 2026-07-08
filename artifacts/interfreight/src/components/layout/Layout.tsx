interface LayoutProps {
  children: React.ReactNode;
}

// Used by staff/customer dashboard pages — no marketing nav/footer needed there.
// The public marketing pages (home, containers) include Navbar and Footer directly.
export function Layout({ children }: LayoutProps) {
  return <>{children}</>;
}
