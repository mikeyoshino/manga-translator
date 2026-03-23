import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { BookOpen } from "lucide-react";
import { useLocale, useT } from "@/context/LocaleContext";

export default function LoginPage() {
  const { signIn, signUp, user } = useAuth();
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
                placeholder={i.displayNamePlaceholder}
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
              placeholder={i.emailPlaceholder}
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
              placeholder={isSignUp ? i.passwordPlaceholderSignUp : i.passwordPlaceholder}
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
                placeholder={i.confirmPasswordPlaceholder}
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
