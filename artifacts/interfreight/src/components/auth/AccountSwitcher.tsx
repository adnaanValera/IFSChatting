import { useMemo, useState } from "react";
import { BriefcaseBusiness, Check, Users } from "lucide-react";
import { SavedAccount, savedAccounts, switchSavedAccount } from "@/lib/saved-accounts";

const CUSTOMER_BADGE_URL = "/ifs-app-premium.png";

function initials(value?: string) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "IF";
}

export function AccountSwitcher({ currentToken }: { currentToken?: string | null }) {
  const [open, setOpen] = useState(false);
  const accounts = useMemo(() => savedAccounts(), [open, currentToken]);
  const current = accounts.find((account) => account.token === currentToken);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/7 px-3 py-2 text-xs sm:text-sm text-white/75 hover:text-white hover:bg-white/12 transition-colors"
      >
        <Users size={15} />
        <span className="hidden sm:inline">Switch</span>
        {current?.companyName && <span className="hidden lg:inline max-w-28 truncate text-white/55">{current.companyName}</span>}
      </button>
      {open && (
        <div className="absolute right-0 mt-3 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl z-50">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-extrabold text-secondary">Switch Account</p>
            <p className="text-xs text-muted-foreground">Saved accounts on this device</p>
          </div>
          {accounts.length === 0 ? (
            <div className="px-4 py-5 text-sm text-muted-foreground">No saved accounts yet.</div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {accounts.map((account: SavedAccount) => {
                const isCurrent = account.token === currentToken;
                return (
                  <button
                    key={account.token}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      if (!isCurrent) switchSavedAccount(account);
                    }}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${isCurrent ? "bg-primary/10" : "hover:bg-muted/70"}`}
                  >
                    {account.role === "customer" ? (
                      <img src={CUSTOMER_BADGE_URL} alt={account.fullName || account.companyName || "Saved account"} className="h-10 w-10 rounded-xl object-cover border border-border shrink-0" />
                    ) : account.profilePictureUrl ? (
                      <img src={account.profilePictureUrl} alt={account.fullName || account.companyName || "Saved account"} className="h-10 w-10 rounded-xl object-cover border border-border shrink-0" />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold">
                        {initials(account.companyName || account.fullName)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-secondary">{account.companyName || account.fullName || "Saved account"}</p>
                      <p className="truncate text-xs text-muted-foreground">{account.email || account.role || "No details saved"}</p>
                    </div>
                    {isCurrent ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-2 py-1 text-[11px] font-bold text-primary">
                        <Check size={12} />
                        Current
                      </span>
                    ) : (
                      <BriefcaseBusiness size={15} className="text-muted-foreground" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
