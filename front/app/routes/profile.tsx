import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/utils/supabase";
import { AuthGuard } from "@/components/AuthGuard";
import { Navbar } from "@/components/Navbar";
import { apiFetch } from "@/utils/api";
import { useLocale, useLocalePath, useT } from "@/context/LocaleContext";
import {
  User,
  Mail,
  Key,
  Shield,
  Coins,
  Loader2,
  CheckCircle2,
  XCircle,
  ExternalLink,
} from "lucide-react";

function ProfileContent() {
  const { user, tokenBalance, isAdmin } = useAuth();
  const navigate = useNavigate();
  const locale = useLocale();
  const lp = useLocalePath();
  const i = useT().profile;

  // Display name
  const [displayName, setDisplayName] = useState("");
  const [originalName, setOriginalName] = useState("");
  const [memberSince, setMemberSince] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [passwordError, setPasswordError] = useState("");

  // Fetch profile
  useEffect(() => {
    if (!user) return;
    apiFetch("/api/user/profile")
      .then((r) => r.json())
      .then((data) => {
        setDisplayName(data.display_name || "");
        setOriginalName(data.display_name || "");
        if (data.created_at) {
          setMemberSince(new Date(data.created_at).toLocaleDateString(locale === "th" ? "th-TH" : "en-US", {
            year: "numeric", month: "long", day: "numeric",
          }));
        }
      })
      .catch(() => {});
  }, [user]);

  const handleSaveName = async () => {
    if (!user || displayName === originalName) return;
    setSavingName(true);
    setNameMsg(null);
    try {
      const res = await apiFetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName }),
      });
      if (res.ok) {
        setOriginalName(displayName);
        setNameMsg({ type: "success", text: i.saveSuccess });
      } else {
        setNameMsg({ type: "error", text: i.saveFailed });
      }
    } catch {
      setNameMsg({ type: "error", text: i.saveFailed });
    } finally {
      setSavingName(false);
      setTimeout(() => setNameMsg(null), 3000);
    }
  };

  const handleChangePassword = async () => {
    setPasswordError("");
    setPasswordMsg(null);

    if (!currentPassword) {
      setPasswordError(i.currentPasswordRequired);
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError(i.passwordTooShort);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(i.passwordMismatch);
      return;
    }

    setSavingPassword(true);
    try {
      // Verify current password
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || "",
        password: currentPassword,
      });
      if (signInError) {
        setPasswordError(i.currentPasswordWrong);
        setSavingPassword(false);
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setPasswordMsg({ type: "error", text: error.message || i.passwordFailed });
      } else {
        setPasswordMsg({ type: "success", text: i.passwordSuccess });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      setPasswordMsg({ type: "error", text: i.passwordFailed });
    } finally {
      setSavingPassword(false);
      setTimeout(() => setPasswordMsg(null), 3000);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Account Info Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
              <User className="w-5 h-5 text-indigo-600" />
            </div>
            <h2 className="text-lg font-bold text-slate-800">{i.accountInfo}</h2>
          </div>

          <div className="space-y-4">
            {/* Email */}
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" /> {i.email}
              </label>
              <input
                type="text"
                value={user?.email || ""}
                readOnly
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-500 cursor-not-allowed"
              />
            </div>

            {/* Display Name */}
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">{i.displayName}</label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={i.displayNamePlaceholder}
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                />
                <button
                  onClick={handleSaveName}
                  disabled={savingName || displayName === originalName}
                  className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {savingName && <Loader2 className="w-4 h-4 animate-spin" />}
                  {savingName ? i.saving : i.save}
                </button>
              </div>
              {nameMsg && (
                <p className={`text-xs mt-1.5 flex items-center gap-1 ${nameMsg.type === "success" ? "text-emerald-600" : "text-red-500"}`}>
                  {nameMsg.type === "success" ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  {nameMsg.text}
                </p>
              )}
            </div>

            {/* Member since & Role */}
            <div className="flex gap-6 pt-2">
              {memberSince && (
                <div>
                  <p className="text-xs font-semibold text-slate-400">{i.memberSince}</p>
                  <p className="text-sm font-semibold text-slate-700">{memberSince}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-slate-400">{i.role}</p>
                <p className="text-sm font-semibold text-slate-700">
                  {isAdmin ? (
                    <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full text-xs font-bold">
                      <Shield className="w-3 h-3" /> {i.admin}
                    </span>
                  ) : i.member}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Token Balance Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
              <Coins className="w-5 h-5 text-emerald-600" />
            </div>
            <h2 className="text-lg font-bold text-slate-800">{i.tokenBalance}</h2>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-3xl font-bold text-indigo-600">
              {isAdmin ? i.adminUnlimited : tokenBalance} <span className="text-sm font-semibold text-slate-400">{i.tokens}</span>
            </p>
            <div className="flex gap-3">
              {!isAdmin && (
                <button
                  onClick={() => navigate(lp("/subscription"))}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors"
                >
                  <Coins className="w-4 h-4" /> {i.topUp}
                </button>
              )}
              <button
                onClick={() => navigate(lp("/studio/token-usage"))}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-200 transition-colors"
              >
                <ExternalLink className="w-4 h-4" /> {i.viewUsage}
              </button>
            </div>
          </div>
        </div>

        {/* Security Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center">
              <Key className="w-5 h-5 text-rose-600" />
            </div>
            <h2 className="text-lg font-bold text-slate-800">{i.security}</h2>
          </div>

          <h3 className="text-sm font-bold text-slate-600 mb-3">{i.changePassword}</h3>
          <div className="space-y-3 max-w-md">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">{i.currentPassword}</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => { setCurrentPassword(e.target.value); setPasswordError(""); }}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500/20 outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">{i.newPassword}</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setPasswordError(""); }}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500/20 outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">{i.confirmPassword}</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(""); }}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500/20 outline-none"
              />
            </div>
            {passwordError && (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <XCircle className="w-3 h-3" /> {passwordError}
              </p>
            )}
            {passwordMsg && (
              <p className={`text-xs flex items-center gap-1 ${passwordMsg.type === "success" ? "text-emerald-600" : "text-red-500"}`}>
                {passwordMsg.type === "success" ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {passwordMsg.text}
              </p>
            )}
            <button
              onClick={handleChangePassword}
              disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
              className="px-5 py-2.5 bg-rose-600 text-white rounded-xl text-sm font-bold hover:bg-rose-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {savingPassword && <Loader2 className="w-4 h-4 animate-spin" />}
              {savingPassword ? i.updating : i.updatePassword}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Force client-side rendering
export const clientLoader = async () => null;
clientLoader.hydrate = true as const;

export function HydrateFallback() {
  return (
    <div className="flex items-center justify-center h-screen bg-slate-50 text-slate-600">
      <p>Loading...</p>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <AuthGuard>
      <div className="flex flex-col h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
        <Navbar />
        <ProfileContent />
      </div>
    </AuthGuard>
  );
}
