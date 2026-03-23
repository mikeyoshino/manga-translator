import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/context/AuthContext";
import { AuthGuard } from "@/components/AuthGuard";
import { Navbar } from "@/components/Navbar";
import { apiFetch } from "@/utils/api";
import { useLocalePath, useT } from "@/context/LocaleContext";
import {
  ArrowLeft,
  Coins,
  Sparkles,
  Zap,
  Crown,
  CheckCircle2,
  Loader2,
  QrCode,
  XCircle,
  CreditCard,
  Smartphone,
  Check,
  Star,
} from "lucide-react";

type PaymentMethod = "promptpay" | "card";

interface TierDef {
  id: string;
  name: string;
  price_satangs: number;
  annual_price_satangs: number;
  monthly_tokens: number;
  max_projects: number;
  project_expiry_days: number;
  batch_limit: number;
  features: Record<string, boolean>;
}

const TOPUP_PACKAGES = [
  { tokens: 500, price: 99, key: "starter" as const, icon: Sparkles, highlight: false },
  { tokens: 1500, price: 249, key: "popular" as const, icon: Zap, highlight: true },
  { tokens: 3500, price: 490, key: "bestValue" as const, icon: Crown, highlight: false },
];

// Declare Omise.js global
declare global {
  interface Window {
    Omise?: {
      setPublicKey: (key: string) => void;
      createToken: (
        type: string,
        data: Record<string, string | number>,
        callback: (statusCode: number, response: any) => void,
      ) => void;
    };
    OmiseCard?: any;
  }
}

const TIER_ORDER = ["free", "starter", "pro", "premium"];

function SubscriptionContent() {
  const { tokenBalance, isAdmin, tierId, subscription, refreshBalance } = useAuth();
  const navigate = useNavigate();
  const lp = useLocalePath();
  const t = useT().subscription;
  const topupT = useT().topup;
  const landingTiers = useT().landing.pricing.tiers;

  // Subscription tiers from API
  const [tiers, setTiers] = useState<TierDef[]>([]);
  const [tiersLoading, setTiersLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");

  // Selected tier for subscription purchase
  const [selectedTier, setSelectedTier] = useState<{ id: string; name: string; priceTHB: number } | null>(null);

  // Top-up payment flow
  const [step, setStep] = useState<"browse" | "payment" | "processing" | "success">("browse");
  const [selectedPackage, setSelectedPackage] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("promptpay");
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [authorizeUri, setAuthorizeUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [chargeId, setChargeId] = useState<string | null>(null);
  const prevBalance = useRef(tokenBalance);
  const pollInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Card form state
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpMonth, setCardExpMonth] = useState("");
  const [cardExpYear, setCardExpYear] = useState("");
  const [cardCvv, setCardCvv] = useState("");

  // Fetch tiers
  useEffect(() => {
    apiFetch("/api/subscription/tiers")
      .then((r) => r.json())
      .then((data) => setTiers(data))
      .catch(() => {})
      .finally(() => setTiersLoading(false));
  }, []);

  // Load Omise.js script
  useEffect(() => {
    if (document.getElementById("omise-js")) return;
    const script = document.createElement("script");
    script.id = "omise-js";
    script.src = "https://cdn.omise.co/omise.js";
    script.async = true;
    document.head.appendChild(script);
  }, []);

  // Poll charge status + balance
  useEffect(() => {
    if (!polling || !chargeId) return;
    prevBalance.current = tokenBalance;
    pollInterval.current = setInterval(async () => {
      try {
        const res = await apiFetch("/api/payment/check-charge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ charge_id: chargeId }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.status === "successful" && data.paid) {
            if (selectedTier) {
              await activateSubscription();
            } else {
              await refreshBalance();
            }
            setPolling(false);
            setStep("success");
            setQrCodeUrl(null);
            setAuthorizeUri(null);
            if (pollInterval.current) clearInterval(pollInterval.current);
            return;
          }
        }
      } catch {}
      await refreshBalance();
    }, 5000);
    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, [polling, chargeId, refreshBalance, selectedTier]);

  // Detect balance increase as fallback
  useEffect(() => {
    if (polling && tokenBalance > prevBalance.current) {
      setPolling(false);
      setStep("success");
      setQrCodeUrl(null);
      setAuthorizeUri(null);
      if (pollInterval.current) clearInterval(pollInterval.current);
    }
  }, [tokenBalance, polling]);

  const selectedPkg = TOPUP_PACKAGES.find((p) => p.tokens === selectedPackage);

  const resetFlow = () => {
    setStep("browse");
    setSelectedPackage(null);
    setSelectedTier(null);
    setQrCodeUrl(null);
    setAuthorizeUri(null);
    setPolling(false);
    setChargeId(null);
    setError(null);
    setCardName("");
    setCardNumber("");
    setCardExpMonth("");
    setCardExpYear("");
    setCardCvv("");
  };

  const selectTopUp = (tokens: number) => {
    setSelectedPackage(tokens);
    setSelectedTier(null);
    setStep("payment");
    setError(null);
  };

  const selectTier = (tier: { id: string; name: string; priceTHB: number }) => {
    setSelectedTier(tier);
    setSelectedPackage(null);
    setStep("payment");
    setError(null);
  };

  const createPromptPayCharge = async () => {
    if (!selectedPackage && !selectedTier) return;
    setError(null);
    setLoading(true);
    setStep("processing");
    try {
      const url = selectedTier ? "/api/payment/create-subscription-charge" : "/api/payment/create-charge";
      const payload = selectedTier
        ? { tier_id: selectedTier.id, billing_cycle: billingCycle, payment_method: "promptpay" }
        : { token_amount: selectedPackage, payment_method: "promptpay" };
      const res = await apiFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to create charge");
      }
      const data = await res.json();
      setChargeId(data.charge_id);
      setQrCodeUrl(data.qr_code_url);
      setAuthorizeUri(data.authorize_uri);
      setPolling(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStep("payment");
    } finally {
      setLoading(false);
    }
  };

  const activateSubscription = async () => {
    if (!selectedTier) return;
    try {
      await apiFetch("/api/subscription/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier_id: selectedTier.id, billing_cycle: billingCycle }),
      });
    } catch {
      // Subscription activation via webhook will handle it as fallback
    }
    await refreshBalance();
  };

  const createCardCharge = async () => {
    if ((!selectedPackage && !selectedTier) || !window.Omise) return;
    setError(null);
    setLoading(true);

    const publicKey = (window as any).__OMISE_PUBLIC_KEY || "pkey_test_670iol8kkx043sonlgu";

    try {
      window.Omise.setPublicKey(publicKey);

      const token = await new Promise<string>((resolve, reject) => {
        window.Omise!.createToken("card", {
          name: cardName,
          number: cardNumber.replace(/\s/g, ""),
          expiration_month: cardExpMonth,
          expiration_year: cardExpYear,
          security_code: cardCvv,
        }, (status, response) => {
          if (status === 200 && response.id) {
            resolve(response.id);
          } else {
            reject(new Error(response.message || "Card tokenization failed"));
          }
        });
      });

      setStep("processing");

      const url = selectedTier ? "/api/payment/create-subscription-charge" : "/api/payment/create-charge";
      const payload = selectedTier
        ? { tier_id: selectedTier.id, billing_cycle: billingCycle, payment_method: "card", card_token: token }
        : { token_amount: selectedPackage, payment_method: "card", card_token: token };
      const res = await apiFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to create charge");
      }
      const data = await res.json();
      setChargeId(data.charge_id);

      if (data.paid) {
        if (selectedTier) {
          await activateSubscription();
        } else {
          await refreshBalance();
        }
        setStep("success");
      } else if (data.authorize_uri) {
        setAuthorizeUri(data.authorize_uri);
        setPolling(true);
      } else {
        setPolling(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStep("payment");
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = () => {
    if (paymentMethod === "promptpay") {
      createPromptPayCharge();
    } else {
      createCardCharge();
    }
  };

  const formatCardNumber = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
  };

  // --- Success state ---
  if (step === "success") {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          {selectedTier ? (
            <>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">{t.subscriptionSuccess}</h2>
              <p className="text-sm text-slate-500 mb-6">{t.subscriptionActivated.replace("{tier}", selectedTier.name)}</p>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">{topupT.paymentSuccess}</h2>
              <p className="text-sm text-slate-500 mb-2">{topupT.tokensCredited}</p>
              <p className="text-3xl font-bold text-indigo-600 mb-6">{tokenBalance} {topupT.tokens}</p>
            </>
          )}
          <div className="flex gap-3 justify-center">
            <button onClick={() => navigate(lp("/studio"))} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors text-sm font-bold shadow-lg shadow-indigo-200">
              {topupT.startTranslating}
            </button>
            <button onClick={resetFlow} className="px-6 py-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors text-sm font-semibold">
              {selectedTier ? t.choosePlan : topupT.buyMore}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Processing / QR state ---
  if (step === "processing") {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          {qrCodeUrl ? (
            <>
              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <QrCode className="w-8 h-8 text-indigo-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">{topupT.scanQr}</h2>
              <p className="text-sm text-slate-500 mb-6">{topupT.scanQrDesc}</p>
              <div className="bg-white border border-slate-200 rounded-2xl p-4 inline-block mb-4 shadow-sm">
                <img src={qrCodeUrl} alt="PromptPay QR Code" className="w-56 h-56" />
              </div>
            </>
          ) : authorizeUri ? (
            <>
              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CreditCard className="w-8 h-8 text-indigo-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">{topupT.openPayment}</h2>
              <a
                href={authorizeUri}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors text-sm font-bold shadow-lg shadow-indigo-200 mb-4"
              >
                {topupT.openPayment}
              </a>
            </>
          ) : (
            <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            </div>
          )}
          <p className="text-sm text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            {topupT.waitingPayment}
          </p>
          <button onClick={resetFlow} className="mt-4 text-sm text-slate-400 hover:text-red-500 transition-colors">
            {topupT.cancel}
          </button>
        </div>
      </div>
    );
  }

  // --- Payment method selection ---
  if (step === "payment" && (selectedPkg || selectedTier)) {
    const displayLabel = selectedTier
      ? `${selectedTier.name} (${billingCycle === "annual" ? t.annual : t.monthly})`
      : `${selectedPkg!.tokens} ${topupT.tokens}`;
    const displayPrice = selectedTier ? selectedTier.priceTHB : selectedPkg!.price;

    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-lg mx-auto">
          <button onClick={() => setStep("browse")} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-600 mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4" /> {topupT.back}
          </button>

          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex items-center justify-between mb-6">
            <div>
              <p className="text-sm font-bold text-slate-700">{displayLabel}</p>
            </div>
            <p className="text-xl font-bold text-indigo-600">{displayPrice} <span className="text-sm">THB</span></p>
          </div>

          <p className="text-sm font-bold text-slate-600 mb-3">{topupT.choosePayment}</p>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <button
              onClick={() => setPaymentMethod("promptpay")}
              className={`relative border-2 rounded-xl p-4 text-left transition-all ${
                paymentMethod === "promptpay"
                  ? "border-indigo-500 bg-indigo-50/50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              {paymentMethod === "promptpay" && (
                <CheckCircle2 className="absolute top-2 right-2 w-4 h-4 text-indigo-600" />
              )}
              <Smartphone className={`w-6 h-6 mb-2 ${paymentMethod === "promptpay" ? "text-indigo-600" : "text-slate-400"}`} />
              <p className="text-sm font-bold text-slate-700">{topupT.promptpay}</p>
              <p className="text-[10px] text-slate-400">{topupT.promptpayDesc}</p>
            </button>
            <button
              onClick={() => setPaymentMethod("card")}
              className={`relative border-2 rounded-xl p-4 text-left transition-all ${
                paymentMethod === "card"
                  ? "border-indigo-500 bg-indigo-50/50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              {paymentMethod === "card" && (
                <CheckCircle2 className="absolute top-2 right-2 w-4 h-4 text-indigo-600" />
              )}
              <CreditCard className={`w-6 h-6 mb-2 ${paymentMethod === "card" ? "text-indigo-600" : "text-slate-400"}`} />
              <p className="text-sm font-bold text-slate-700">{topupT.creditCard}</p>
              <p className="text-[10px] text-slate-400">{topupT.creditCardDesc}</p>
            </button>
          </div>

          {paymentMethod === "card" && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">{topupT.cardName}</label>
                <input type="text" value={cardName} onChange={(e) => setCardName(e.target.value)} placeholder="John Doe"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500/20 outline-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">{topupT.cardNumber}</label>
                <input type="text" value={cardNumber} onChange={(e) => setCardNumber(formatCardNumber(e.target.value))} placeholder="4242 4242 4242 4242" maxLength={19}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 tracking-wider focus:ring-2 focus:ring-indigo-500/20 outline-none" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">{topupT.expiry}</label>
                  <div className="flex gap-1.5">
                    <input type="text" value={cardExpMonth} onChange={(e) => setCardExpMonth(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="MM" maxLength={2}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-sm text-slate-900 text-center focus:ring-2 focus:ring-indigo-500/20 outline-none" />
                    <input type="text" value={cardExpYear} onChange={(e) => setCardExpYear(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="YYYY" maxLength={4}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-sm text-slate-900 text-center focus:ring-2 focus:ring-indigo-500/20 outline-none" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">{topupT.cvv}</label>
                  <input type="password" value={cardCvv} onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="123" maxLength={4}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 text-center focus:ring-2 focus:ring-indigo-500/20 outline-none" />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl mb-4 text-sm">
              <XCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={handlePayment}
            disabled={loading || (paymentMethod === "card" && (!cardNumber || !cardName || !cardExpMonth || !cardExpYear || !cardCvv))}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors text-sm font-bold shadow-lg shadow-indigo-200 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> {topupT.processing}</>
            ) : (
              <>{paymentMethod === "card" ? <CreditCard className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />} {topupT.payAmount} {displayPrice} THB</>
            )}
          </button>

          <p className="text-center text-[10px] text-slate-400 mt-4">{topupT.paymentNote}</p>
        </div>
      </div>
    );
  }

  // --- Main page: Current Plan + Tiers + Top-Up ---
  const currentTierId = tierId || "free";
  const tierIdx = TIER_ORDER.indexOf(currentTierId);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto space-y-12">

        {/* Section 1: Current Plan Banner */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
              <Star className="w-5 h-5 text-indigo-600" />
            </div>
            <h2 className="text-lg font-bold text-slate-800">{t.currentPlan}</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs font-semibold text-slate-400">{t.plan}</p>
              <p className="text-lg font-bold text-slate-800 capitalize">{subscription?.tier_name || currentTierId}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400">{t.monthlyTokens}</p>
              <p className="text-lg font-bold text-indigo-600">{subscription?.monthly_tokens ?? 50}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400">{t.billingCycle}</p>
              <p className="text-lg font-bold text-slate-800 capitalize">{subscription?.billing_cycle || "-"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400">{t.periodEnd}</p>
              <p className="text-lg font-bold text-slate-800">
                {subscription?.period_end
                  ? new Date(subscription.period_end).toLocaleDateString()
                  : "-"}
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 border border-emerald-100 rounded-full">
              <Coins className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-xs font-semibold text-emerald-700">
                {isAdmin ? "Unlimited" : tokenBalance} {topupT.tokens}
              </span>
            </div>
          </div>
        </div>

        {/* Section 2: Subscription Tiers */}
        <div>
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-slate-800 mb-2">{t.choosePlan}</h2>

            {/* Monthly / Annual Toggle */}
            <div className="mt-4 inline-flex items-center bg-slate-100 rounded-full p-1 border border-slate-200">
              <button
                onClick={() => setBillingCycle("monthly")}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                  billingCycle === "monthly"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {t.monthly}
              </button>
              <button
                onClick={() => setBillingCycle("annual")}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                  billingCycle === "annual"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {t.annual}
                <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full font-semibold">
                  {t.annualSave}
                </span>
              </button>
            </div>
          </div>

          {tiersLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {tiers.map((tier, tierIndex) => {
                const isCurrent = tier.id === currentTierId;
                const isPopular = tier.id === "pro";
                const thisTierIdx = TIER_ORDER.indexOf(tier.id);
                const isUpgrade = thisTierIdx > tierIdx;
                const monthlyPriceTHB = tier.price_satangs / 100;
                const annualPriceTHB = tier.annual_price_satangs / 100;
                const displayPrice = billingCycle === "monthly"
                  ? monthlyPriceTHB
                  : Math.round((annualPriceTHB / 12) * 10) / 10;
                const imagesCount = Math.floor(tier.monthly_tokens / 10);
                // Use i18n feature lists for display (API features is a permission flags object)
                const displayFeatures: string[] = landingTiers[tierIndex]?.features ?? [];

                return (
                  <div
                    key={tier.id}
                    className={`relative flex flex-col p-7 rounded-3xl transition-all ${
                      isPopular
                        ? "bg-indigo-600 text-white transform lg:-translate-y-4 shadow-xl ring-2 ring-indigo-400"
                        : "bg-white border border-slate-200 hover:shadow-lg"
                    }`}
                  >
                    {isPopular && (
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white text-indigo-600 px-4 py-1.5 rounded-full text-xs font-bold tracking-wide shadow-sm">
                        {t.mostPopular}
                      </div>
                    )}
                    {isCurrent && (
                      <div className={`absolute top-0 right-4 -translate-y-1/2 px-3 py-1 rounded-full text-xs font-bold ${
                        isPopular ? "bg-white text-indigo-600" : "bg-indigo-600 text-white"
                      }`}>
                        {t.currentBadge}
                      </div>
                    )}

                    <h3 className={`text-lg font-semibold mb-1 ${isPopular ? "text-white" : "text-slate-800"}`}>
                      {tier.name}
                    </h3>

                    {/* Price */}
                    <div className="mb-1">
                      <span className="text-3xl font-bold">
                        {monthlyPriceTHB === 0 ? "\u0E3F0" : `\u0E3F${displayPrice}`}
                      </span>
                      {monthlyPriceTHB > 0 && (
                        <span className={`text-sm ${isPopular ? "text-indigo-200" : "text-slate-400"}`}>
                          {t.perMonth}
                        </span>
                      )}
                    </div>
                    {billingCycle === "annual" && annualPriceTHB > 0 && (
                      <p className={`text-xs mb-3 ${isPopular ? "text-indigo-200" : "text-slate-400"}`}>
                        {"\u0E3F"}{annualPriceTHB.toLocaleString()}{t.perYear}
                      </p>
                    )}
                    {(billingCycle === "monthly" || annualPriceTHB === 0) && <div className="mb-3" />}

                    {/* Tokens */}
                    <div className={`text-sm font-medium mb-5 ${isPopular ? "text-indigo-100" : "text-slate-600"}`}>
                      {tier.monthly_tokens.toLocaleString()} {t.tokensPerMonth}
                      <span className={`block text-xs ${isPopular ? "text-indigo-200" : "text-slate-400"}`}>
                        ({imagesCount} {t.images})
                      </span>
                    </div>

                    {/* CTA */}
                    {isCurrent ? (
                      <div className={`block w-full py-3 rounded-xl font-semibold text-center mb-6 ${
                        isPopular ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                      }`}>
                        {t.currentBadge}
                      </div>
                    ) : monthlyPriceTHB === 0 ? (
                      <div className="block w-full py-3 rounded-xl font-semibold text-center mb-6 bg-slate-100 text-slate-500">
                        {t.getStarted}
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          const price = billingCycle === "monthly" ? monthlyPriceTHB : annualPriceTHB;
                          selectTier({ id: tier.id, name: tier.name, priceTHB: price });
                        }}
                        className={`block w-full py-3 rounded-xl font-semibold text-center transition-all mb-6 ${
                          isPopular
                            ? "bg-white text-indigo-600 hover:bg-slate-50 shadow-sm"
                            : "bg-indigo-600 text-white hover:bg-indigo-700"
                        }`}
                      >
                        {isUpgrade ? t.upgrade : t.subscribe}
                      </button>
                    )}

                    {/* Features */}
                    <ul className="space-y-2.5 flex-1">
                      {displayFeatures.map((feature, fIdx) => (
                        <li key={fIdx} className="flex items-start gap-2 text-sm">
                          <Check className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isPopular ? "text-indigo-200" : "text-indigo-400"}`} />
                          <span className={isPopular ? "text-indigo-50" : "text-slate-600"}>
                            {feature}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Section 3: Top-Up Tokens */}
        {!isAdmin && (
          <div>
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-slate-800 mb-2">{t.topUpTitle}</h2>
              <p className="text-sm text-slate-500">{t.topUpDesc}</p>
              <p className="text-xs text-slate-400 mt-1">
                {topupT.currentBalance}: <span className="font-bold text-indigo-600">{tokenBalance} {topupT.tokens}</span>
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-3xl mx-auto">
              {TOPUP_PACKAGES.map((pkg) => {
                const Icon = pkg.icon;
                return (
                  <div
                    key={pkg.tokens}
                    className={`relative border-2 rounded-2xl p-6 text-center cursor-pointer transition-all hover:shadow-lg group ${
                      pkg.highlight
                        ? "border-indigo-500 bg-indigo-50/50 shadow-md shadow-indigo-100"
                        : "border-slate-200 bg-white hover:border-indigo-300"
                    }`}
                    onClick={() => selectTopUp(pkg.tokens)}
                  >
                    {pkg.highlight && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                        {topupT.mostPopular}
                      </span>
                    )}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3 ${
                      pkg.highlight ? "bg-indigo-100" : "bg-slate-100 group-hover:bg-indigo-100"
                    } transition-colors`}>
                      <Icon className={`w-5 h-5 ${pkg.highlight ? "text-indigo-600" : "text-slate-400 group-hover:text-indigo-600"} transition-colors`} />
                    </div>
                    <p className="text-4xl font-bold text-slate-800 mb-0.5">{pkg.tokens}</p>
                    <p className="text-xs text-slate-400 mb-4">{topupT.tokens}</p>
                    <p className="text-2xl font-bold text-indigo-600">{pkg.price} <span className="text-sm">THB</span></p>
                    <button className={`mt-4 w-full py-2.5 rounded-xl text-sm font-bold transition-all ${
                      pkg.highlight
                        ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200"
                        : "bg-slate-100 text-slate-700 hover:bg-indigo-600 hover:text-white"
                    }`}>
                      {topupT.buyNow}
                    </button>
                  </div>
                );
              })}
            </div>

            <p className="text-center text-[10px] text-slate-400 mt-6">{topupT.paymentNote}</p>
          </div>
        )}
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

export default function SubscriptionPage() {
  return (
    <AuthGuard>
      <div className="flex flex-col h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
        <Navbar />
        <SubscriptionContent />
      </div>
    </AuthGuard>
  );
}
