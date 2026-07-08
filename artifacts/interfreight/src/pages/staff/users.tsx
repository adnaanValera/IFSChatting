import { useListStaffUsers, useStaffLogout } from "@workspace/api-client-react";
import { Loader2, Users, Shield, LogOut, ArrowLeft } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";

export default function UsersList() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const logoutMutation = useStaffLogout();
  const { data: users, isLoading } = useListStaffUsers();

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        localStorage.removeItem("intf_token");
        queryClient.clear();
        setLocation("/auth");
      }
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pt-20">
      {/* Sub-nav */}
      <div className="bg-secondary text-secondary-foreground py-4 px-6 mb-8 border-b border-secondary-border shadow-sm">
        <div className="container mx-auto max-w-5xl flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Users size={20} className="text-primary" /> User Management
            </h1>
            <div className="hidden sm:flex items-center gap-4 text-sm font-medium">
              <Link href="/staff/dashboard" className="text-muted-foreground hover:text-white cursor-pointer transition-colors flex items-center gap-1">
                <ArrowLeft size={16} /> Back to Dashboard
              </Link>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-white transition-colors"
          >
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl pb-20">
        <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="p-6 border-b border-border flex justify-between items-center bg-muted/20">
            <div>
              <h2 className="text-lg font-bold text-secondary">All Accounts</h2>
              <p className="text-sm text-muted-foreground mt-1">All registered users in the system</p>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border">
                <tr>
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Company</th>
                  <th className="px-6 py-4">Email</th>
                  <th className="px-6 py-4">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(users as any[])?.map((user: any) => (
                  <tr key={user.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-4 font-semibold text-secondary">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                          {(user.fullName || user.name || "?").charAt(0).toUpperCase()}
                        </div>
                        {user.fullName || user.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{user.companyName || "—"}</td>
                    <td className="px-6 py-4 text-muted-foreground">{user.email}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                        user.role === "staff"
                          ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                          : "bg-green-50 text-green-700 border-green-200"
                      }`}>
                        <Shield size={12} />
                        {user.role}
                      </span>
                    </td>
                  </tr>
                ))}
                {!users?.length && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">No users found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
