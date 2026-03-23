import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/context/AuthContext";
import { AuthGuard } from "@/components/AuthGuard";
import { Navbar } from "@/components/Navbar";
import { apiFetch } from "@/utils/api";
import { useLocale, useT } from "@/context/LocaleContext";
import {
  Coins,
  ArrowUpCircle,
  Image,
  RotateCcw,
  Loader2,
  Inbox,
} from "lucide-react";

interface Transaction {
  id: string;
  amount: number;
  balance_after: number;
  type: string;
  reference_id: string | null;
  channel: string | null;
  created_at: string;
}

const PAGE_SIZE = 20;

function TokenUsageContent() {
  const { user, tokenBalance, isAdmin } = useAuth();
  const navigate = useNavigate();
  const locale = useLocale();
  const i = useT().tokenUsage;

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const fetchTransactions = useCallback(async (offset: number, append: boolean) => {
    if (!user) return;
    try {
      const res = await apiFetch(`/api/user/transactions?limit=${PAGE_SIZE}&offset=${offset}`);
      if (!res.ok) return;
      const data: Transaction[] = await res.json();
      if (data.length < PAGE_SIZE) setHasMore(false);
      setTransactions((prev) => append ? [...prev, ...data] : data);
    } catch {
      // silent
    }
  }, [user]);

  useEffect(() => {
    setLoading(true);
    fetchTransactions(0, false).finally(() => setLoading(false));
  }, [fetchTransactions]);

  const loadMore = async () => {
    setLoadingMore(true);
    await fetchTransactions(transactions.length, true);
    setLoadingMore(false);
  };

  // Compute summaries
  const totalSpent = transactions.reduce((sum, tx) => tx.amount < 0 ? sum + Math.abs(tx.amount) : sum, 0);
  const totalTopUp = transactions.reduce((sum, tx) => tx.amount > 0 ? sum + tx.amount : sum, 0);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(locale === "th" ? "th-TH" : "en-US", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "topup":
        return { label: i.topup, bg: "bg-emerald-50", text: "text-emerald-600", Icon: ArrowUpCircle };
      case "translation":
        return { label: i.translation, bg: "bg-indigo-50", text: "text-indigo-600", Icon: Image };
      case "refund":
        return { label: i.refund, bg: "bg-amber-50", text: "text-amber-600", Icon: RotateCcw };
      default:
        return { label: type, bg: "bg-slate-50", text: "text-slate-600", Icon: Coins };
    }
  };

  const getDescription = (type: string) => {
    switch (type) {
      case "topup": return i.topupDesc;
      case "translation": return i.translationDesc;
      case "refund": return i.refundDesc;
      default: return type;
    }
  };

  const getChannelLabel = (tx: Transaction): string => {
    switch (tx.channel) {
      case "promptpay": return i.channelPromptpay;
      case "card": return i.channelCard;
      case "api": return i.channelApi;
      case "system": return i.channelSystem;
      default:
        // Fallback for old rows without channel field
        if (!tx.channel) return i.channelSystem;
        return tx.channel;
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{i.currentBalance}</p>
            <p className="text-3xl font-bold text-indigo-600">{isAdmin ? "∞" : tokenBalance}</p>
            <p className="text-xs text-slate-400 mt-1">{i.tokens}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{i.totalSpent}</p>
            <p className="text-3xl font-bold text-red-500">{totalSpent}</p>
            <p className="text-xs text-slate-400 mt-1">{i.tokens}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{i.totalTopUp}</p>
            <p className="text-3xl font-bold text-emerald-600">{totalTopUp}</p>
            <p className="text-xs text-slate-400 mt-1">{i.tokens}</p>
          </div>
        </div>

        {/* Transaction List */}
        {transactions.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Inbox className="w-8 h-8 text-slate-300" />
            </div>
            <h3 className="text-lg font-bold text-slate-600 mb-2">{i.empty}</h3>
            <p className="text-sm text-slate-400 max-w-sm mx-auto">{i.emptyDesc}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.map((tx) => {
              const badge = getTypeBadge(tx.type);
              const BadgeIcon = badge.Icon;
              return (
                <div key={tx.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4">
                  {/* Icon */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${badge.bg}`}>
                    <BadgeIcon className={`w-5 h-5 ${badge.text}`} />
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-bold text-slate-700">{getDescription(tx.type)}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.bg} ${badge.text}`}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span>{formatDate(tx.created_at)}</span>
                      <span className="text-slate-200">|</span>
                      <span className="truncate max-w-[200px]">{getChannelLabel(tx)}</span>
                    </div>
                  </div>
                  {/* Amount & Balance */}
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold ${tx.amount >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {tx.amount >= 0 ? "+" : ""}{tx.amount}
                    </p>
                    <p className="text-[10px] text-slate-400">{i.balance}: {tx.balance_after}</p>
                  </div>
                </div>
              );
            })}

            {/* Load More */}
            {hasMore && (
              <div className="text-center pt-4">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-6 py-2.5 bg-white border border-slate-200 text-sm font-semibold text-slate-600 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {loadingMore ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> {i.loading}</>
                  ) : (
                    i.loadMore
                  )}
                </button>
              </div>
            )}
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

export default function TokenUsagePage() {
  return (
    <AuthGuard>
      <div className="flex flex-col h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
        <Navbar />
        <TokenUsageContent />
      </div>
    </AuthGuard>
  );
}
