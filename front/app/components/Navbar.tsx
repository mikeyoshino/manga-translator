import { useState, useEffect, useRef } from "react";
import { useNavigate, Link, useLocation } from "react-router";
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
import { useLocale, useLocalePath, useT } from "@/context/LocaleContext";


interface NavbarProps {
  /** Show back button that navigates to home */
  showBack?: boolean;
  /** Show language toggle (only on home page) */
  showLanguageToggle?: boolean;
}

export function Navbar({ showBack = false, showLanguageToggle = false }: NavbarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, tokenBalance, isAdmin, signOut } = useAuth();
  const locale = useLocale();
  const lp = useLocalePath();
  const otherLocale = locale === "th" ? "en" : "th";
  const i = useT().navbar;

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
    window.location.href = lp("/login");
  };

  // Build the "other locale" version of the current path
  const otherLocalePath = location.pathname.replace(`/${locale}`, `/${otherLocale}`);

  return (
    <header className="h-14 bg-white border-b border-slate-200 px-3 sm:px-6 flex items-center justify-between z-30 shrink-0">
      <div className="flex items-center gap-3">
        {showBack && (
          <button
            onClick={() => navigate(lp("/studio"))}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> {i.back}
          </button>
        )}
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-1.5 rounded-lg">
            <BookOpen className="text-white w-5 h-5" />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-slate-800">WunPlae</h1>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-4">
        {showLanguageToggle && (
          <Link
            to={otherLocalePath}
            className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 border border-slate-200 rounded-full hover:bg-slate-200 transition-colors text-xs font-semibold text-slate-600"
          >
            <Languages className="w-3.5 h-3.5" />
            {locale === "th" ? "EN" : "TH"}
          </Link>
        )}
        {isAdmin ? (
          <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 border border-amber-100 rounded-full">
            <Coins className="w-3.5 h-3.5 text-amber-600" />
            <span className="hidden sm:inline text-xs font-semibold text-amber-700">{i.adminUnlimited}</span>
          </div>
        ) : (
          <button
            onClick={() => navigate(lp("/subscription"))}
            className="flex items-center gap-2 px-3 py-1 bg-emerald-50 border border-emerald-100 rounded-full hover:bg-emerald-100 transition-colors"
          >
            <Coins className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden sm:inline text-xs font-semibold text-emerald-700">{tokenBalance} {i.tokens}</span>
          </button>
        )}
        <div className="hidden sm:block h-6 w-px bg-slate-200" />
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
                <button onClick={() => { setProfileOpen(false); navigate(lp("/studio/profile")); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                  <User className="w-4 h-4 text-slate-400" /> {i.profile}
                </button>
                <button onClick={() => { setProfileOpen(false); navigate(lp("/subscription")); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                  <CreditCard className="w-4 h-4 text-slate-400" /> {i.subscription}
                </button>
                <button onClick={() => { setProfileOpen(false); navigate(lp("/studio/token-usage")); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
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
