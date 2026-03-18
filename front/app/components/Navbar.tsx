import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import {
  BookOpen,
  ArrowLeft,
  Languages,
  Coins,
  User,
  CreditCard,
  BarChart3,
  ChevronDown,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

type Locale = "th" | "en";

const t = {
  th: {
    tokens: "โทเค็น",
    adminUnlimited: "ผู้ดูแล (ไม่จำกัด)",
    profile: "โปรไฟล์",
    subscription: "แพ็กเกจสมาชิก",
    tokenUsage: "การใช้โทเค็น",
    signOut: "ออกจากระบบ",
    back: "กลับ",
  },
  en: {
    tokens: "Tokens",
    adminUnlimited: "Admin (Unlimited)",
    profile: "Profile",
    subscription: "Subscription",
    tokenUsage: "Token Usage",
    signOut: "Sign out",
    back: "Back",
  },
} as const;

interface NavbarProps {
  /** Show back button that navigates to home */
  showBack?: boolean;
  /** Show language toggle (only on home page) */
  showLanguageToggle?: boolean;
  /** Current locale (needed when showLanguageToggle is true) */
  locale?: Locale;
  /** Locale setter (needed when showLanguageToggle is true) */
  onLocaleChange?: (locale: Locale) => void;
}

export function Navbar({ showBack = false, showLanguageToggle = false, locale: localeProp, onLocaleChange }: NavbarProps) {
  const navigate = useNavigate();
  const { user, tokenBalance, isAdmin, signOut } = useAuth();

  const locale = localeProp || (typeof window !== "undefined" ? localStorage.getItem("manga-translator-locale") as Locale : null) || "th";
  const i = t[locale];

  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between z-30 shrink-0">
      <div className="flex items-center gap-3">
        {showBack && (
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> {i.back}
          </button>
        )}
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-1.5 rounded-lg">
            <BookOpen className="text-white w-5 h-5" />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-slate-800">Manga Translator</h1>
        </div>
      </div>
      <div className="flex items-center gap-4">
        {showLanguageToggle && onLocaleChange && (
          <button
            onClick={() => onLocaleChange(locale === "th" ? "en" : "th")}
            className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 border border-slate-200 rounded-full hover:bg-slate-200 transition-colors text-xs font-semibold text-slate-600"
          >
            <Languages className="w-3.5 h-3.5" />
            {locale === "th" ? "EN" : "TH"}
          </button>
        )}
        {isAdmin ? (
          <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 border border-amber-100 rounded-full">
            <Coins className="w-3.5 h-3.5 text-amber-600" />
            <span className="text-xs font-semibold text-amber-700">{i.adminUnlimited}</span>
          </div>
        ) : (
          <button
            onClick={() => navigate("/topup")}
            className="flex items-center gap-2 px-3 py-1 bg-emerald-50 border border-emerald-100 rounded-full hover:bg-emerald-100 transition-colors"
          >
            <Coins className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-xs font-semibold text-emerald-700">{tokenBalance} {i.tokens}</span>
          </button>
        )}
        <div className="h-6 w-px bg-slate-200" />
        <div ref={profileRef} className="relative">
          <button
            onClick={() => setProfileOpen((v) => !v)}
            className="flex items-center gap-1.5 p-1 hover:bg-slate-100 rounded-full transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
              <User className="w-4 h-4 text-indigo-600" />
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${profileOpen ? "rotate-180" : ""}`} />
          </button>
          {profileOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-lg py-2 z-50">
              <div className="px-4 py-2 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-700 truncate">{user?.email}</p>
                {isAdmin && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded mt-1 inline-block">Admin</span>}
              </div>
              <div className="py-1">
                <button onClick={() => { setProfileOpen(false); navigate("/profile"); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                  <User className="w-4 h-4 text-slate-400" /> {i.profile}
                </button>
                <button onClick={() => { setProfileOpen(false); navigate("/topup"); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                  <CreditCard className="w-4 h-4 text-slate-400" /> {i.subscription}
                </button>
                <button onClick={() => { setProfileOpen(false); navigate("/token-usage"); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                  <BarChart3 className="w-4 h-4 text-slate-400" /> {i.tokenUsage}
                  <span className="ml-auto text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                    {isAdmin ? "\u221e" : tokenBalance}
                  </span>
                </button>
              </div>
              <div className="border-t border-slate-100 py-1">
                <button onClick={() => { setProfileOpen(false); handleSignOut(); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors">
                  <LogOut className="w-4 h-4" /> {i.signOut}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
