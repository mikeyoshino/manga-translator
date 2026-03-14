import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/context/AuthContext";
import { AuthGuard } from "@/components/AuthGuard";
import {
  BookOpen,
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
} from "lucide-react";

type Locale = "th" | "en";
type PaymentMethod = "promptpay" | "card";

const t = {
  th: {
    topUp: "เติมโทเค็น",
    currentBalance: "ยอดคงเหลือ",
    tokens: "โทเค็น",
    perImage: "1 โทเค็น = 1 รูปที่แปล (AI-Powered)",
    images: "รูป",
    chapters: "ตอนมังงะ",
    pagesEach: "~5 หน้า/ตอน",
    perImagePrice: "บาท / รูป",
    save: "ประหยัด",
    vsStarter: "จากแพ็กเริ่มต้น",
    buyNow: "ซื้อเลย",
    processing: "กำลังดำเนินการ...",
    mostPopular: "ยอดนิยม",
    starter: "เริ่มต้น",
    popular: "ยอดนิยม",
    bestValue: "คุ้มที่สุด",
    whatYouGet: "ทุกรูปประกอบด้วย",
    textDetection: "ตรวจจับข้อความ",
    ocrRecognition: "OCR อ่านข้อความ",
    aiTranslation: "AI แปลภาษา",
    inpainting: "ลบข้อความเดิม",
    textRendering: "ใส่ข้อความแปล",
    paymentNote: "โทเค็นจะเข้าทันทีหลังชำระ",
    scanQr: "สแกน QR เพื่อชำระเงิน",
    scanQrDesc: "เปิดแอปธนาคารแล้วสแกน QR Code พร้อมเพย์",
    openPayment: "เปิดหน้าชำระเงิน",
    waitingPayment: "กำลังรอการยืนยันการชำระเงิน...",
    cancel: "ยกเลิก",
    paymentSuccess: "ชำระเงินสำเร็จ!",
    tokensCredited: "โทเค็นได้ถูกเพิ่มเข้าบัญชีของคุณแล้ว",
    startTranslating: "เริ่มแปลเลย",
    buyMore: "ซื้อเพิ่ม",
    back: "กลับ",
    choosePayment: "เลือกวิธีชำระเงิน",
    promptpay: "พร้อมเพย์",
    promptpayDesc: "สแกน QR ผ่านแอปธนาคาร",
    creditCard: "บัตรเครดิต / เดบิต",
    creditCardDesc: "Visa, Mastercard, JCB",
    continuePayment: "ดำเนินการชำระเงิน",
    cardNumber: "หมายเลขบัตร",
    cardName: "ชื่อบนบัตร",
    expiry: "วันหมดอายุ",
    cvv: "CVV",
    payAmount: "ชำระ",
    cardProcessing: "กำลังประมวลผลบัตร...",
    selected: "เลือกแล้ว",
  },
  en: {
    topUp: "Top Up Tokens",
    currentBalance: "Current balance",
    tokens: "tokens",
    perImage: "1 token = 1 image translated (AI-Powered)",
    images: "images",
    chapters: "manga chapters",
    pagesEach: "~5 pages each",
    perImagePrice: "THB / image",
    save: "Save",
    vsStarter: "vs Starter",
    buyNow: "Buy Now",
    processing: "Processing...",
    mostPopular: "MOST POPULAR",
    starter: "Starter",
    popular: "Popular",
    bestValue: "Best Value",
    whatYouGet: "What you get per image",
    textDetection: "Text detection",
    ocrRecognition: "OCR recognition",
    aiTranslation: "AI translation",
    inpainting: "Inpainting",
    textRendering: "Text rendering",
    paymentNote: "Tokens are credited instantly after payment.",
    scanQr: "Scan QR Code to Pay",
    scanQrDesc: "Open your banking app and scan this PromptPay QR code.",
    openPayment: "Open Payment Page",
    waitingPayment: "Waiting for payment confirmation...",
    cancel: "Cancel",
    paymentSuccess: "Payment Successful!",
    tokensCredited: "Tokens have been credited to your account.",
    startTranslating: "Start Translating",
    buyMore: "Buy More",
    back: "Back",
    choosePayment: "Choose payment method",
    promptpay: "PromptPay",
    promptpayDesc: "Scan QR via banking app",
    creditCard: "Credit / Debit Card",
    creditCardDesc: "Visa, Mastercard, JCB",
    continuePayment: "Continue to Payment",
    cardNumber: "Card Number",
    cardName: "Name on Card",
    expiry: "Expiry",
    cvv: "CVV",
    payAmount: "Pay",
    cardProcessing: "Processing card...",
    selected: "Selected",
  },
} as const;

const PACKAGES = [
  { tokens: 50, price: 29, key: "starter" as const, icon: Sparkles, highlight: false },
  { tokens: 200, price: 99, key: "popular" as const, icon: Zap, highlight: true },
  { tokens: 500, price: 199, key: "bestValue" as const, icon: Crown, highlight: false },
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

function TopUpContent() {
  const { session, tokenBalance, isAdmin, refreshBalance } = useAuth();
  const navigate = useNavigate();
  const locale = (typeof window !== "undefined" ? localStorage.getItem("manga-translator-locale") as Locale : null) || "th";
  const i = t[locale];

  // Flow steps: "packages" → "payment" → "processing" → "success"
  const [step, setStep] = useState<"packages" | "payment" | "processing" | "success">("packages");
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
        // Ask backend to check charge status with Omise (also credits tokens if successful)
        const res = await fetch("/api/payment/check-charge", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ charge_id: chargeId }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.status === "successful" && data.paid) {
            await refreshBalance();
            setPolling(false);
            setStep("success");
            setQrCodeUrl(null);
            setAuthorizeUri(null);
            if (pollInterval.current) clearInterval(pollInterval.current);
            return;
          }
        }
      } catch {}
      // Fallback: also check balance directly
      await refreshBalance();
    }, 5000);
    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, [polling, chargeId, session?.access_token, refreshBalance]);

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

  const selectedPkg = PACKAGES.find((p) => p.tokens === selectedPackage);

  const selectPackage = (tokens: number) => {
    setSelectedPackage(tokens);
    setStep("payment");
    setError(null);
  };

  const resetFlow = () => {
    setStep("packages");
    setSelectedPackage(null);
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

  const createPromptPayCharge = async () => {
    if (!selectedPackage) return;
    setError(null);
    setLoading(true);
    setStep("processing");
    try {
      const res = await fetch("/api/payment/create-charge", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ token_amount: selectedPackage, payment_method: "promptpay" }),
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

  const createCardCharge = async () => {
    if (!selectedPackage || !window.Omise) return;
    setError(null);
    setLoading(true);

    // Get public key from env or hardcode for now
    const publicKey = (window as any).__OMISE_PUBLIC_KEY || "pkey_test_670iol8kkx043sonlgu";

    try {
      window.Omise.setPublicKey(publicKey);

      // Create token via Omise.js
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

      const res = await fetch("/api/payment/create-charge", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ token_amount: selectedPackage, payment_method: "card", card_token: token }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to create charge");
      }
      const data = await res.json();
      setChargeId(data.charge_id);

      if (data.paid) {
        // Immediately successful
        await refreshBalance();
        setStep("success");
      } else if (data.authorize_uri) {
        // 3D Secure — redirect
        setAuthorizeUri(data.authorize_uri);
        setPolling(true);
      } else {
        // Pending — poll
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

  // Format card number with spaces
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
          <h2 className="text-2xl font-bold text-slate-800 mb-2">{i.paymentSuccess}</h2>
          <p className="text-sm text-slate-500 mb-2">{i.tokensCredited}</p>
          <p className="text-3xl font-bold text-indigo-600 mb-6">{tokenBalance} {i.tokens}</p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => navigate("/")} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors text-sm font-bold shadow-lg shadow-indigo-200">
              {i.startTranslating}
            </button>
            <button onClick={resetFlow} className="px-6 py-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors text-sm font-semibold">
              {i.buyMore}
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
              <h2 className="text-xl font-bold text-slate-800 mb-2">{i.scanQr}</h2>
              <p className="text-sm text-slate-500 mb-6">{i.scanQrDesc}</p>
              <div className="bg-white border border-slate-200 rounded-2xl p-4 inline-block mb-4 shadow-sm">
                <img src={qrCodeUrl} alt="PromptPay QR Code" className="w-56 h-56" />
              </div>
            </>
          ) : authorizeUri ? (
            <>
              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CreditCard className="w-8 h-8 text-indigo-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">{i.openPayment}</h2>
              <a
                href={authorizeUri}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors text-sm font-bold shadow-lg shadow-indigo-200 mb-4"
              >
                {i.openPayment}
              </a>
            </>
          ) : (
            <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            </div>
          )}
          <p className="text-sm text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            {i.waitingPayment}
          </p>
          <button onClick={resetFlow} className="mt-4 text-sm text-slate-400 hover:text-red-500 transition-colors">
            {i.cancel}
          </button>
        </div>
      </div>
    );
  }

  // --- Payment method selection (step === "payment") ---
  if (step === "payment" && selectedPkg) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-lg mx-auto">
          {/* Back to packages */}
          <button onClick={() => setStep("packages")} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-600 mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4" /> {i.back}
          </button>

          {/* Selected package summary */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex items-center justify-between mb-6">
            <div>
              <p className="text-sm font-bold text-slate-700">{i[selectedPkg.key]} — {selectedPkg.tokens} {i.images}</p>
              <p className="text-xs text-slate-400">~{Math.round(selectedPkg.tokens / 5)} {i.chapters}</p>
            </div>
            <p className="text-xl font-bold text-indigo-600">{selectedPkg.price} <span className="text-sm">THB</span></p>
          </div>

          {/* Payment method tabs */}
          <p className="text-sm font-bold text-slate-600 mb-3">{i.choosePayment}</p>
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
              <p className="text-sm font-bold text-slate-700">{i.promptpay}</p>
              <p className="text-[10px] text-slate-400">{i.promptpayDesc}</p>
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
              <p className="text-sm font-bold text-slate-700">{i.creditCard}</p>
              <p className="text-[10px] text-slate-400">{i.creditCardDesc}</p>
            </button>
          </div>

          {/* Card form (only if card selected) */}
          {paymentMethod === "card" && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">{i.cardName}</label>
                <input
                  type="text"
                  value={cardName}
                  onChange={(e) => setCardName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">{i.cardNumber}</label>
                <input
                  type="text"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                  placeholder="4242 4242 4242 4242"
                  maxLength={19}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 tracking-wider focus:ring-2 focus:ring-indigo-500/20 outline-none"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">{i.expiry}</label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={cardExpMonth}
                      onChange={(e) => setCardExpMonth(e.target.value.replace(/\D/g, "").slice(0, 2))}
                      placeholder="MM"
                      maxLength={2}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-sm text-slate-900 text-center focus:ring-2 focus:ring-indigo-500/20 outline-none"
                    />
                    <input
                      type="text"
                      value={cardExpYear}
                      onChange={(e) => setCardExpYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      placeholder="YYYY"
                      maxLength={4}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-sm text-slate-900 text-center focus:ring-2 focus:ring-indigo-500/20 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">{i.cvv}</label>
                  <input
                    type="password"
                    value={cardCvv}
                    onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="123"
                    maxLength={4}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 text-center focus:ring-2 focus:ring-indigo-500/20 outline-none"
                  />
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
              <><Loader2 className="w-4 h-4 animate-spin" /> {i.processing}</>
            ) : (
              <>{paymentMethod === "card" ? <CreditCard className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />} {i.payAmount} {selectedPkg.price} THB</>
            )}
          </button>

          <p className="text-center text-[10px] text-slate-400 mt-4">{i.paymentNote}</p>
        </div>
      </div>
    );
  }

  // --- Package selection (step === "packages") ---
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold text-slate-800 mb-2">{i.topUp}</h2>
          <p className="text-sm text-slate-500 mb-1">
            {i.currentBalance}: <span className="font-bold text-indigo-600">{isAdmin ? "∞" : tokenBalance} {i.tokens}</span>
          </p>
          <p className="text-xs text-slate-400">{i.perImage}</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl mb-6 text-sm max-w-md mx-auto">
            <XCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
          {PACKAGES.map((pkg) => {
            const Icon = pkg.icon;
            return (
              <div
                key={pkg.tokens}
                className={`relative border-2 rounded-2xl p-6 text-center cursor-pointer transition-all hover:shadow-lg group ${
                  pkg.highlight
                    ? "border-indigo-500 bg-indigo-50/50 shadow-md shadow-indigo-100"
                    : "border-slate-200 bg-white hover:border-indigo-300"
                }`}
                onClick={() => selectPackage(pkg.tokens)}
              >
                {pkg.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                    {i.mostPopular}
                  </span>
                )}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3 ${
                  pkg.highlight ? "bg-indigo-100" : "bg-slate-100 group-hover:bg-indigo-100"
                } transition-colors`}>
                  <Icon className={`w-5 h-5 ${pkg.highlight ? "text-indigo-600" : "text-slate-400 group-hover:text-indigo-600"} transition-colors`} />
                </div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">{i[pkg.key]}</p>
                <p className="text-4xl font-bold text-slate-800 mb-0.5">{pkg.tokens}</p>
                <p className="text-xs text-slate-400 mb-1">{i.images}</p>
                <p className="text-[10px] text-slate-400 mb-4">
                  ~{Math.round(pkg.tokens / 5)} {i.chapters} ({i.pagesEach})
                </p>
                <p className="text-2xl font-bold text-indigo-600">{pkg.price} <span className="text-sm">THB</span></p>
                <p className="text-[10px] text-slate-400 mt-1">
                  {(pkg.price / pkg.tokens).toFixed(2)} {i.perImagePrice}
                </p>
                {pkg.tokens >= 200 && (
                  <p className="text-[10px] text-emerald-600 font-bold mt-1">
                    {i.save} {Math.round((1 - (pkg.price / pkg.tokens) / (29 / 50)) * 100)}% {i.vsStarter}
                  </p>
                )}
                <button className={`mt-4 w-full py-2.5 rounded-xl text-sm font-bold transition-all ${
                  pkg.highlight
                    ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200"
                    : "bg-slate-100 text-slate-700 hover:bg-indigo-600 hover:text-white"
                }`}>
                  {i.buyNow}
                </button>
              </div>
            );
          })}
        </div>

        <div className="text-center mb-6">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">{i.whatYouGet}</p>
          <div className="flex flex-wrap justify-center gap-3">
            {[i.textDetection, i.ocrRecognition, i.aiTranslation, i.inpainting, i.textRendering].map((step) => (
              <span key={step} className="flex items-center gap-1.5 text-xs text-slate-500 bg-white border border-slate-200 px-3 py-1.5 rounded-full">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                {step}
              </span>
            ))}
          </div>
        </div>

        <p className="text-center text-[10px] text-slate-400">{i.paymentNote}</p>
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

export default function TopUpPage() {
  const navigate = useNavigate();
  const locale = (typeof window !== "undefined" ? localStorage.getItem("manga-translator-locale") as Locale : null) || "th";
  const i = t[locale];

  return (
    <AuthGuard>
      <div className="flex flex-col h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
        <header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center gap-4 z-30 shrink-0">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> {i.back}
          </button>
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-1.5 rounded-lg">
              <BookOpen className="text-white w-5 h-5" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-slate-800">Manga Translator</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Coins className="w-4 h-4 text-indigo-500" />
            <span className="text-sm font-bold text-slate-700">{i.topUp}</span>
          </div>
        </header>
        <TopUpContent />
      </div>
    </AuthGuard>
  );
}
