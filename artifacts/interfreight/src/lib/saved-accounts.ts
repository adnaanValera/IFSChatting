export type SavedAccount = {
  token: string;
  fullName?: string;
  companyName?: string;
  email?: string;
  role?: string;
  profilePictureUrl?: string;
};

export function savedAccounts(): SavedAccount[] {
  try {
    const parsed = JSON.parse(localStorage.getItem("intf_saved_accounts") || "[]");
    return Array.isArray(parsed) ? parsed.filter((account) => account?.token) : [];
  } catch {
    return [];
  }
}

export function saveAccount(token: string | null, user: any) {
  if (!token || !user) return;
  const accounts = savedAccounts().filter((account) => account.token !== token && account.email !== user.email);
  accounts.unshift({
    token,
    fullName: user.fullName || user.name,
    companyName: user.companyName,
    email: user.email,
    role: user.role,
    profilePictureUrl: user.profilePictureUrl,
  });
  localStorage.setItem("intf_saved_accounts", JSON.stringify(accounts.slice(0, 8)));
}

export function removeSavedAccountByEmail(email?: string | null) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail) return;
  const accounts = savedAccounts().filter((account) => String(account.email || "").trim().toLowerCase() !== cleanEmail);
  localStorage.setItem("intf_saved_accounts", JSON.stringify(accounts));
}

export function removeSavedAccountByToken(token?: string | null) {
  const cleanToken = String(token || "").trim();
  if (!cleanToken) return;
  const accounts = savedAccounts().filter((account) => account.token !== cleanToken);
  localStorage.setItem("intf_saved_accounts", JSON.stringify(accounts));
}

export function setSavedAccounts(accounts: SavedAccount[]) {
  localStorage.setItem("intf_saved_accounts", JSON.stringify(accounts.slice(0, 8)));
}

export function switchSavedAccount(account: SavedAccount) {
  localStorage.setItem("intf_token", account.token);
  localStorage.setItem("intf_session_duration_confirmed", "1");
  window.location.href = account.role === "staff" || account.role === "admin" ? "/staff/dashboard" : "/dashboard";
}
