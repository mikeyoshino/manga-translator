import { useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/landing";
import { useLocale, useLocalePath, useT } from "@/context/LocaleContext";
import type { Locale } from "@/context/LocaleContext";
import { getMessages } from "@/i18n";
import {
  Languages,
  Sparkles,
  Download,
  Search,
  ScanLine,
  Eraser,
  Type,
  Wand2,
  MousePointerClick,
  Copy,
  Paintbrush,
  RotateCcw,
  FolderTree,
  Layers,
  Cloud,
  Save,
  CheckCircle2,
  ShieldCheck,
  Zap,
  ArrowRight,
  Image as ImageIcon,
  Edit3,
  Check,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const DOMAIN = "https://wunplae.com";

export function meta({ params }: Route.MetaArgs) {
  const lang = (params.lang as Locale) || "th";
  const s = getMessages(lang).landing.seo;
  const otherLang = lang === "th" ? "en" : "th";
  const otherS = getMessages(otherLang).landing.seo;

  return [
    { title: s.title },
    { name: "description", content: s.description },
    { property: "og:title", content: s.title },
    { property: "og:description", content: s.description },
    { property: "og:image", content: `${DOMAIN}/images/after-${lang}.webp` },
    { property: "og:locale", content: s.ogLocale },
    { property: "og:locale:alternate", content: otherS.ogLocale },
    { property: "og:url", content: `${DOMAIN}/${lang}` },
    { property: "og:type", content: "website" },
    { tagName: "link", rel: "canonical", href: `${DOMAIN}/${lang}` },
    {
      tagName: "link",
      rel: "alternate",
      hrefLang: "th",
      href: `${DOMAIN}/th`,
    },
    {
      tagName: "link",
      rel: "alternate",
      hrefLang: "en",
      href: `${DOMAIN}/en`,
    },
    {
      tagName: "link",
      rel: "alternate",
      hrefLang: "x-default",
      href: `${DOMAIN}/th`,
    },
  ];
}

// --- Icon map for pipeline steps (avoids JSX in data) ---
const pipelineIcons: LucideIcon[] = [Search, ScanLine, Eraser, Languages, Type];

// --- Icon map for feature items ---
const featureIcons: LucideIcon[] = [
  Edit3, Wand2, MousePointerClick, Copy, Paintbrush, RotateCcw,
  Download, FolderTree, Layers, Zap, Cloud, Save,
];

export default function LandingPage() {
  const lang = useLocale();
  const lp = useLocalePath();
  const otherLocale = lang === "th" ? "en" : "th";
  const [sliderPosition, setSliderPosition] = useState(50);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const t = useT().landing;

  const handleMove = (e: React.MouseEvent<HTMLDivElement> | React.Touch) => {
    const target =
      "currentTarget" in e ? e.currentTarget : (e as React.Touch).target;
    const rect = (target as HTMLElement).getBoundingClientRect();
    const clientX = "clientX" in e ? e.clientX : 0;
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percent = (x / rect.width) * 100;
    setSliderPosition(percent);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percent = (x / rect.width) * 100;
    setSliderPosition(percent);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(
      0,
      Math.min(e.touches[0].clientX - rect.left, rect.width)
    );
    const percent = (x / rect.width) * 100;
    setSliderPosition(percent);
  };

  return (
    <div
      className="min-h-screen bg-[#fafbfc] font-sans text-slate-800 relative overflow-hidden"
    >
      <style>
        {`
          .bg-dots {
            background-image: radial-gradient(#cbd5e1 1px, transparent 1px);
            background-size: 24px 24px;
            opacity: 0.3;
          }
        `}
      </style>

      {/* Decorative Background Elements */}
      <div className="absolute inset-0 bg-dots z-0 pointer-events-none" />
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-indigo-50 rounded-full blur-[120px] -z-10 pointer-events-none" />

      {/* Navigation */}
      <nav className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="bg-indigo-600 p-2 rounded-lg text-white">
                <Languages className="w-5 h-5" />
              </div>
              <span className="font-semibold text-xl tracking-tight text-slate-900">
                WunPlae
              </span>
            </div>
            <div className="flex items-center gap-4">
              <Link
                to={`/${otherLocale}`}
                className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-full"
              >
                <Languages className="w-4 h-4" />
                {t.nav.lang}
              </Link>
              <a
                href={lp("/login")}
                className="hidden sm:block text-slate-600 font-medium hover:text-indigo-600 transition-colors"
              >
                {t.nav.login}
              </a>
              <a
                href={lp("/login")}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-medium shadow-sm shadow-indigo-200 transition-all hover:-translate-y-0.5"
              >
                {t.nav.startFree}
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-20 pb-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 font-medium text-sm rounded-full border border-indigo-100">
              <Sparkles className="w-4 h-4" />
              <span>AI-Powered Manga Translation</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.15] text-slate-900">
              {t.hero.titleLine1}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">
                {t.hero.titleHighlight}
              </span>
              {t.hero.titleLine2 && <><br />{t.hero.titleLine2}</>}
            </h1>
            <p className="text-lg text-slate-600 leading-relaxed max-w-xl">
              {t.hero.subhead}
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <a
                href={lp("/login")}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-xl font-semibold text-lg shadow-lg shadow-indigo-200 transition-all hover:-translate-y-1 flex justify-center items-center gap-2"
              >
                {t.hero.cta} <ArrowRight className="w-5 h-5" />
              </a>
            </div>
            <p className="text-sm text-slate-500 font-medium mt-4 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              {t.footer.langs}
            </p>
          </div>

          {/* Visual: Before/After Slider */}
          <div className="relative p-2">
            <div
              className="relative aspect-[800/819] rounded-3xl overflow-hidden shadow-2xl shadow-slate-200 border border-slate-100 cursor-ew-resize bg-slate-100 select-none group"
              onMouseMove={handleMouseMove}
              onTouchMove={handleTouchMove}
            >
              {/* Base Image (AFTER — translated) */}
              <img
                src={`/images/after-${lang}.webp`}
                alt="Translated manga page"
                className="absolute inset-0 w-full h-full object-cover"
                draggable={false}
              />

              {/* Top Image (BEFORE — original Japanese) */}
              <div
                className="absolute inset-0 h-full overflow-hidden"
                style={{
                  clipPath: `polygon(0 0, ${sliderPosition}% 0, ${sliderPosition}% 100%, 0 100%)`,
                }}
              >
                <img
                  src="/images/before.webp"
                  alt="Original manga page"
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              </div>

              {/* Slider Line & Handle */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_10px_rgba(0,0,0,0.3)] z-20 pointer-events-none"
                style={{
                  left: `${sliderPosition}%`,
                  transform: "translateX(-50%)",
                }}
              >
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white text-slate-400 rounded-full flex items-center justify-center shadow-lg border border-slate-100 transition-transform group-hover:scale-110">
                  <div className="flex gap-0.5">
                    <div className="w-0.5 h-3 bg-slate-300 rounded-full" />
                    <div className="w-0.5 h-3 bg-slate-300 rounded-full" />
                  </div>
                </div>
              </div>

              {/* Labels */}
              <div className="absolute top-4 left-4 bg-white/90 backdrop-blur text-slate-700 px-3 py-1.5 rounded-full font-medium text-xs shadow-sm z-20 pointer-events-none">
                {t.hero.before}
              </div>
              <div className="absolute top-4 right-4 bg-indigo-600/90 backdrop-blur text-white px-3 py-1.5 rounded-full font-medium text-xs shadow-sm z-20 pointer-events-none">
                {t.hero.after}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 bg-white relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900">
              {t.steps.title}
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connecting line for desktop */}
            <div className="hidden md:block absolute top-[2.5rem] left-[20%] right-[20%] h-[1px] bg-slate-200 z-0" />

            <div className="relative z-10 flex flex-col items-center text-center space-y-4">
              <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-600 mb-2 ring-1 ring-slate-100">
                <ImageIcon className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900">
                {t.steps.s1.title}
              </h3>
              <p className="text-slate-500 text-sm leading-relaxed">
                {t.steps.s1.desc}
              </p>
            </div>

            <div className="relative z-10 flex flex-col items-center text-center space-y-4">
              <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center text-white mb-2 shadow-lg shadow-indigo-200">
                <Sparkles className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900">
                {t.steps.s2.title}
              </h3>
              <p className="text-slate-500 text-sm leading-relaxed">
                {t.steps.s2.desc}
              </p>
            </div>

            <div className="relative z-10 flex flex-col items-center text-center space-y-4">
              <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-600 mb-2 ring-1 ring-slate-100">
                <Download className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900">
                {t.steps.s3.title}
              </h3>
              <p className="text-slate-500 text-sm leading-relaxed">
                {t.steps.s3.desc}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* AI Pipeline */}
      <section className="py-24 bg-slate-50 relative z-10 border-y border-slate-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900">
              {t.pipeline.title}
            </h2>
          </div>
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="divide-y divide-slate-100">
              {t.pipeline.steps.map((step, idx) => {
                const Icon = pipelineIcons[idx];
                return (
                  <div
                    key={idx}
                    className="flex items-start gap-5 p-6 sm:p-8 hover:bg-slate-50/50 transition-colors"
                  >
                    <div className="flex-shrink-0 w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md">
                          Step {idx + 1}
                        </span>
                        <h4 className="text-lg font-semibold text-slate-900">
                          {step.name}
                        </h4>
                      </div>
                      <p className="text-slate-500 leading-relaxed text-sm">
                        {step.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-24 bg-white relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900">
              {t.features.title}
            </h2>
            <div className="flex justify-center gap-3 mt-6">
              <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-slate-600 text-sm font-medium">
                <Edit3 className="w-4 h-4" /> {t.features.editor}
              </span>
              <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-slate-600 text-sm font-medium">
                <FolderTree className="w-4 h-4" /> {t.features.project}
              </span>
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {t.features.items.map((item, idx) => {
              const Icon = featureIcons[idx];
              return (
                <div
                  key={idx}
                  className="bg-white p-6 rounded-2xl border border-slate-100 hover:border-indigo-100 hover:shadow-md transition-all group"
                >
                  <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-600 mb-4 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h4 className="text-lg font-semibold text-slate-900 mb-2">
                    {item.title}
                  </h4>
                  <p className="text-slate-500 text-sm leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-24 bg-slate-900 text-white relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">{t.pricing.title}</h2>
            <p className="text-slate-400 max-w-2xl mx-auto text-lg">
              {t.pricing.subtitle}
            </p>

            {/* Monthly / Annual Toggle */}
            <div className="mt-8 inline-flex items-center bg-slate-800 rounded-full p-1 border border-slate-700">
              <button
                onClick={() => setBillingCycle("monthly")}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                  billingCycle === "monthly"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {t.pricing.monthly}
              </button>
              <button
                onClick={() => setBillingCycle("annual")}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                  billingCycle === "annual"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {t.pricing.annual}
                <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full font-semibold">
                  {t.pricing.annualSave}
                </span>
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {t.pricing.tiers.map((tier, idx) => (
              <div
                key={idx}
                className={`relative flex flex-col p-7 rounded-3xl transition-transform ${
                  tier.popular
                    ? "bg-indigo-600 transform lg:-translate-y-4 shadow-xl shadow-indigo-900/50 ring-2 ring-indigo-400"
                    : "bg-slate-800/50 border border-slate-700/50 backdrop-blur-sm hover:bg-slate-800"
                }`}
              >
                {tier.popular && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white text-indigo-600 px-4 py-1.5 rounded-full text-xs font-bold tracking-wide shadow-sm">
                    {t.pricing.mostPopular}
                  </div>
                )}

                <h3 className="text-lg font-semibold text-white mb-1">
                  {tier.name}
                </h3>

                {/* Price */}
                <div className="mb-1">
                  <span className="text-3xl font-bold">
                    {billingCycle === "monthly"
                      ? tier.monthlyPrice
                      : (tier.annualMonthly ?? tier.monthlyPrice)}
                  </span>
                  {tier.monthlyPrice !== "฿0" && (
                    <span className={`text-sm ${tier.popular ? "text-indigo-200" : "text-slate-400"}`}>
                      {t.pricing.perMonth}
                    </span>
                  )}
                </div>
                {billingCycle === "annual" && tier.annualPrice !== "฿0" && (
                  <p className={`text-xs mb-3 ${tier.popular ? "text-indigo-200" : "text-slate-400"}`}>
                    {tier.annualPrice}{t.pricing.perYear}
                  </p>
                )}
                {(billingCycle === "monthly" || tier.annualPrice === "฿0") && (
                  <div className="mb-3" />
                )}

                {/* Tokens */}
                <div className={`text-sm font-medium mb-5 ${tier.popular ? "text-indigo-100" : "text-slate-300"}`}>
                  {tier.tokens} {t.pricing.tokensPerMonth}
                  <span className={`block text-xs ${tier.popular ? "text-indigo-200" : "text-slate-400"}`}>
                    ({tier.imageCount} {t.pricing.images})
                  </span>
                </div>

                {/* CTA */}
                <a
                  href={lp("/login")}
                  className={`block w-full py-3 rounded-xl font-semibold text-center transition-all mb-6 ${
                    tier.popular
                      ? "bg-white text-indigo-600 hover:bg-slate-50 shadow-sm"
                      : "bg-white/10 text-white hover:bg-white/20"
                  }`}
                >
                  {tier.cta}
                </a>

                {/* Features */}
                <ul className="space-y-2.5 flex-1">
                  {tier.features.map((feature, fIdx) => (
                    <li key={fIdx} className="flex items-start gap-2 text-sm">
                      <Check className={`w-4 h-4 flex-shrink-0 mt-0.5 ${tier.popular ? "text-indigo-200" : "text-indigo-400"}`} />
                      <span className={tier.popular ? "text-indigo-50" : "text-slate-300"}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust & Footer CTA */}
      <footer className="bg-slate-50 pt-20 pb-10 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-20">
            <h3 className="text-xl font-bold text-slate-900 mb-8 flex items-center gap-2 justify-center sm:justify-start">
              <ShieldCheck className="text-indigo-600 w-6 h-6" />
              {t.trust.title}
            </h3>
            <div className="grid sm:grid-cols-3 gap-6">
              {t.trust.items.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 bg-white p-5 rounded-2xl shadow-sm border border-slate-100"
                >
                  <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-slate-600 leading-relaxed">
                    {item}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-indigo-600 rounded-[2.5rem] p-10 sm:p-16 text-center text-white shadow-xl shadow-indigo-200/50 relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
            <h2 className="text-3xl sm:text-4xl font-bold mb-8 relative z-10">
              {t.footer.cta}
            </h2>
            <a
              href={lp("/login")}
              className="inline-block bg-white text-indigo-600 px-10 py-4 rounded-2xl font-semibold text-lg hover:bg-slate-50 shadow-sm transition-transform hover:-translate-y-1 relative z-10"
            >
              {t.footer.btn}
            </a>
          </div>

          <div className="mt-16 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-slate-500">
            <div className="flex items-center gap-2 text-slate-900 text-lg font-semibold">
              <div className="bg-indigo-600 p-1.5 rounded-lg">
                <Languages className="w-4 h-4 text-white" />
              </div>
              WunPlae
            </div>
            <p>
              &copy; {new Date().getFullYear()} WunPlae. All rights
              reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
