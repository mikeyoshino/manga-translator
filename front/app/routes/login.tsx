import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { BookOpen } from "lucide-react";
import { useLocale, useT } from "@/context/LocaleContext";

export default function LoginPage() {
  const { signIn, signUp, signInWithGoogle, user } = useAuth();
  const locale = useLocale();
  const i = useT().login;

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signUpSuccess, setSignUpSuccess] = useState(false);

  const pwRules = isSignUp && password.length > 0 ? {
    minLength: password.length >= 8,
    hasLetter: /[A-Za-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
    asciiOnly: /^[\x20-\x7E]*$/.test(password),
  } : null;
  const pwValid = pwRules ? Object.values(pwRules).every(Boolean) : true;

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      window.location.href = `/${locale}/studio`;
    }
  }, [user, locale]);

  if (user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (isSignUp) {
        if (!pwValid) {
          setSubmitting(false);
          return;
        }
        if (password !== confirmPassword) {
          setError(i.passwordMismatch);
          setSubmitting(false);
          return;
        }
        const { error: err } = await signUp(email, password, displayName || undefined, locale);
        if (err) {
          setError(err.message);
        } else {
          setSignUpSuccess(true);
        }
      } else {
        const { error: err } = await signIn(email, password);
        if (err) {
          setError(err.message);
        } else {
          window.location.href = `/${locale}/studio`;
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (signUpSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm w-full max-w-md text-center">
          <h2 className="text-2xl font-bold text-emerald-600 mb-4">{i.checkEmail}</h2>
          <p className="text-slate-600 mb-6">
            {i.confirmationSent} <strong>{email}</strong>. {i.verifyEmail}
          </p>
          <button
            onClick={() => { setSignUpSuccess(false); setIsSignUp(false); }}
            className="text-indigo-600 hover:text-indigo-500 font-medium"
          >
            {i.backToSignIn}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm w-full max-w-md">
        <div className="flex items-center justify-center mb-6">
          <div className="bg-indigo-600 p-1.5 rounded-lg mr-2">
            <BookOpen className="text-white w-5 h-5" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">WunPlae</h1>
        </div>

        <h2 className="text-xl font-semibold text-center text-slate-800 mb-6">
          {isSignUp ? i.createAccount : i.signIn}
        </h2>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">{i.displayName}</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-gray-900"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-1">{i.email}</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-1">{i.password}</label>
            <input
              type="password"
              required
              minLength={isSignUp ? 8 : 6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-gray-900"
            />
            {pwRules && (
              <ul className="mt-2 space-y-1 text-xs">
                <li className={pwRules.minLength ? "text-emerald-600" : "text-slate-400"}>
                  {pwRules.minLength ? "\u2713" : "\u2022"} {i.pwRuleMinLength}
                </li>
                <li className={pwRules.hasLetter ? "text-emerald-600" : "text-slate-400"}>
                  {pwRules.hasLetter ? "\u2713" : "\u2022"} {i.pwRuleLetter}
                </li>
                <li className={pwRules.hasNumber ? "text-emerald-600" : "text-slate-400"}>
                  {pwRules.hasNumber ? "\u2713" : "\u2022"} {i.pwRuleNumber}
                </li>
                <li className={pwRules.hasSpecial ? "text-emerald-600" : "text-slate-400"}>
                  {pwRules.hasSpecial ? "\u2713" : "\u2022"} {i.pwRuleSpecial}
                </li>
                <li className={pwRules.asciiOnly ? "text-emerald-600" : "text-red-500"}>
                  {pwRules.asciiOnly ? "\u2713" : "\u2717"} {i.pwRuleAsciiOnly}
                </li>
              </ul>
            )}
          </div>
          {isSignUp && (
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">{i.confirmPasswordLabel}</label>
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-gray-900"
              />
            </div>
          )}
          <button
            type="submit"
            disabled={submitting || (isSignUp && !pwValid)}
            className="w-full py-2 px-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all font-bold shadow-lg shadow-indigo-200"
          >
            {submitting ? i.submitting : isSignUp ? i.signUp : i.signIn}
          </button>
        </form>

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-sm text-slate-400">{i.or}</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        <button
          type="button"
          onClick={() => signInWithGoogle(locale)}
          className="w-full flex items-center justify-center gap-3 py-2 px-4 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-all font-medium text-slate-700 shadow-sm"
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 0 0 1 12c0 1.94.46 3.77 1.18 5.07l3.66-2.84z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          {i.continueWithGoogle}
        </button>

        <p className="mt-4 text-center text-sm text-slate-600">
          {isSignUp ? i.alreadyHaveAccount : i.noAccount}{" "}
          <button
            onClick={() => { setIsSignUp(!isSignUp); setError(null); setConfirmPassword(""); }}
            className="text-indigo-600 hover:text-indigo-500 font-medium"
          >
            {isSignUp ? i.signIn : i.signUp}
          </button>
        </p>
      </div>
    </div>
  );
}
