import { Redirect } from "wouter";

// Staff login has been merged into the combined auth page.
export default function StaffLogin() {
  return <Redirect to="/auth" />;
}
