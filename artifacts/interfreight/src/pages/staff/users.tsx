import { useEffect, useState } from "react";
import { useGetMe, useListStaffUsers, useStaffLogout } from "@workspace/api-client-react";
import { Users, Shield, LogOut, ArrowLeft, Trash2, KeyRound, Save } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { AccountSwitcher } from "@/components/auth/AccountSwitcher";
import { removeSavedAccountByEmail, saveAccount } from "@/lib/saved-accounts";
import { Spinner } from "@/components/ui/spinner";

export default function UsersList() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const logoutMutation = useStaffLogout();
  const { data: me } = useGetMe();
  const { data: users, isLoading } = useListStaffUsers();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [changingPasswordId, setChangingPasswordId] = useState<number | null>(null);
  const [savingPictureId, setSavingPictureId] = useState<number | null>(null);
  const [pictureDrafts, setPictureDrafts] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!me) return;
    saveAccount(localStorage.getItem("intf_token"), me);
  }, [me]);

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        localStorage.removeItem("intf_token");
        localStorage.removeItem("intf_session_duration_confirmed");
        queryClient.clear();
        setLocation("/auth");
      }
    });
  };

  const handleDeleteUser = async (user: any) => {
    const password = window.prompt(`Enter your admin password to delete ${user.email}`);
    if (!password) return;

    setDeletingId(user.id);
    try {
      const token = localStorage.getItem("intf_token");
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/staff/users/${user.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to delete user");
      }
      removeSavedAccountByEmail(user.email);
      queryClient.invalidateQueries();
    } catch (err: any) {
      alert(err.message || "Failed to delete user");
    } finally {
      setDeletingId(null);
    }
  };

  const handleChangePassword = async (user: any) => {
    const adminPassword = window.prompt(`Enter your admin password to change ${user.email}'s password`);
    if (!adminPassword) return;

    const newPassword = window.prompt(`Enter the new password for ${user.email}`);
    if (!newPassword) return;
    if (newPassword.length < 6) {
      alert("New password must be at least 6 characters");
      return;
    }

    setChangingPasswordId(user.id);
    try {
      const token = localStorage.getItem("intf_token");
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/staff/users/${user.id}/password`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ adminPassword, newPassword }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to change password");
      }
      alert(`Password changed for ${user.email}`);
    } catch (err: any) {
      alert(err.message || "Failed to change password");
    } finally {
      setChangingPasswordId(null);
    }
  };

  const handleSaveProfilePicture = async (user: any) => {
    setSavingPictureId(user.id);
    try {
      const token = localStorage.getItem("intf_token");
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/staff/users/${user.id}/profile-picture`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ profilePictureUrl: pictureDrafts[user.id] ?? "" }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to update profile picture");
      }
      queryClient.invalidateQueries();
    } catch (err: any) {
      alert(err.message || "Failed to update profile picture");
    } finally {
      setSavingPictureId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Spinner className="w-10 h-10" />
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
          <div className="flex items-center gap-3">
            <AccountSwitcher currentToken={localStorage.getItem("intf_token")} />
            <button 
              onClick={handleLogout}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-white transition-colors"
            >
              <LogOut size={16} /> Sign Out
            </button>
          </div>
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
                  <th className="px-6 py-4">Profile Picture</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(users as any[])?.map((user: any) => (
                  <tr key={user.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-4 font-semibold text-secondary">
                      <div className="flex items-center gap-3">
                        {user.profilePictureUrl ? (
                          <img src={user.profilePictureUrl} alt={user.fullName || user.name || "User"} className="w-8 h-8 rounded-full object-cover border border-border shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                            {(user.fullName || user.name || "?").charAt(0).toUpperCase()}
                          </div>
                        )}
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
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <input
                          type="url"
                          placeholder="https://..."
                          value={pictureDrafts[user.id] ?? user.profilePictureUrl ?? ""}
                          onChange={(e) => setPictureDrafts((current) => ({ ...current, [user.id]: e.target.value }))}
                          className="w-56 max-w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                        />
                        <button
                          onClick={() => handleSaveProfilePicture(user)}
                          disabled={savingPictureId === user.id}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-primary hover:bg-primary/90 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {savingPictureId === user.id ? <Spinner className="h-[13px] w-[13px]" /> : <Save size={13} />}
                          Save
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleChangePassword(user)}
                        disabled={changingPasswordId === user.id}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-secondary hover:text-primary border border-border hover:bg-primary/5 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50 mr-2"
                        title="Change password"
                      >
                        {changingPasswordId === user.id ? <Spinner className="h-[13px] w-[13px]" /> : <KeyRound size={13} />}
                        Password
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user)}
                        disabled={deletingId === user.id}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700 border border-red-200 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                        title="Delete user"
                      >
                        {deletingId === user.id ? <Spinner className="h-[13px] w-[13px]" /> : <Trash2 size={13} />}
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {!users?.length && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">No users found</td>
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
