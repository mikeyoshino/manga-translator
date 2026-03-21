import { useState } from "react";
import { Link } from "react-router";
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
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export function meta() {
  return [
    { title: "Manga Translator — AI-Powered Manga & Webtoon Translation" },
    {
      name: "description",
      content:
        "Translate manga and webtoons automatically with AI. Detect text, OCR, inpaint, translate, and render — all in one tool.",
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

// --- Translation Dictionary ---
const translations = {
  th: {
    nav: {
      login: "เข้าสู่ระบบ",
      startFree: "เริ่มต้นใช้งานฟรี",
      lang: "EN",
      switchLang: "en" as const,
    },
    hero: {
      subhead:
        "ตรวจจับ ลบ และแทนที่ข้อความในมังงะและคอมมิคโดยอัตโนมัติ — คงลายเส้นต้นฉบับไว้ รองรับกว่า 30 ภาษา",
      cta: "เริ่มแปลฟรี (รับ 5 โทเคนฟรี)",
      before: "ต้นฉบับ (ญี่ปุ่น)",
      after: "แปลแล้ว (ไทย)",
    },
    steps: {
      title: "วิธีการทำงาน",
      s1: {
        title: "1. อัปโหลด",
        desc: "วางหน้ามังงะของคุณ (รองรับการอัปโหลดทีละหลายรูปเพื่อบริบทการแปลที่ดีขึ้น)",
      },
      s2: {
        title: "2. AI แปลภาษา",
        desc: "ระบบจะตรวจจับข้อความ ลบออกอย่างแนบเนียน แปลความหมาย และเรนเดอร์ข้อความใหม่",
      },
      s3: {
        title: "3. แก้ไข & ดาวน์โหลด",
        desc: "ปรับแต่งการแปลในเครื่องมือแก้ไขที่มีให้ จากนั้นกดดาวน์โหลดผลลัพธ์",
      },
    },
    pipeline: {
      title: "ฟีเจอร์ของระบบ AI (ทำงานอย่างไรเบื้องหลัง)",
      steps: [
        {
          name: "Text Detection",
          desc: "AI ค้นหาตำแหน่งของกรอบคำพูดและเอฟเฟกต์เสียงทั้งหมดด้วยโมเดล DBNET/CTD/CRAFT",
        },
        {
          name: "OCR Recognition",
          desc: "อ่านข้อความต้นฉบับด้วยโมเดล OCR ที่ปรับแต่งมาสำหรับมังงะโดยเฉพาะ",
        },
        {
          name: "Smart Inpainting",
          desc: "ลบข้อความต้นฉบับและสร้างพื้นหลังงานศิลป์ขึ้นมาทดแทนอย่างแนบเนียน (LaMa AI)",
        },
        {
          name: "AI Translation",
          desc: "แปลภาษาโดยเข้าใจบริบทด้วย GPT-4o — เข้าใจบทสนทนามังงะ สแลง และโทนเสียง",
        },
        {
          name: "Text Rendering",
          desc: "จัดวางข้อความที่แปลแล้วให้เข้ากับขนาดตัวอักษร สี และตำแหน่งเดิม",
        },
      ],
    },
    features: {
      title: "เครื่องมือระดับโปร ที่ใช้งานง่าย",
      editor: "เครื่องมือแก้ไข (Editor)",
      project: "การจัดการโปรเจกต์",
      items: [
        {
          title: "Visual Text Editor",
          desc: "ปรับแต่งฟอนต์ ขนาด สี ตำแหน่ง การจัดแนว ตัวหนา/เอียง และขอบข้อความได้ทุกจุด",
        },
        {
          title: "Magic Remover",
          desc: "ระบายทับข้อความหรือสิ่งตกค้าง แล้ว AI จะจัดการลบและซ่อมแซมภาพให้",
        },
        {
          title: "Manual Translate",
          desc: "เลือกพื้นที่ที่ตกหล่นและสั่งรัน AI แปลภาษาเฉพาะจุดนั้นได้ทันที",
        },
        {
          title: "Clone Stamp",
          desc: "ซ่อมแซมพื้นหลังระดับพิกเซลโดยโคลนจากพื้นที่ใกล้เคียง",
        },
        {
          title: "Pen & Eraser",
          desc: "วาดหรือลบได้อย่างอิสระ สำหรับการจดโน้ตหรือตกแต่งเพิ่มเติม",
        },
        {
          title: "Undo/Redo",
          desc: "ประวัติการทำงานครบถ้วน ย้อนกลับได้ทุกการกระทำ",
        },
        {
          title: "Batch Export",
          desc: "ดาวน์โหลดเป็นภาพเดี่ยวหรือดาวน์โหลดทุกหน้าพร้อมกันเป็นไฟล์ ZIP",
        },
        {
          title: "จัดกลุ่มโปรเจกต์",
          desc: "รวบรวมมังงะเป็นตอนๆ ไว้ในโปรเจกต์เดียว (สูงสุด 5 โปรเจกต์ที่ใช้งานอยู่)",
        },
        {
          title: "แปลพร้อมกันหลายหน้า",
          desc: "อัปโหลดหลายหน้าและสั่งแปลทั้งหมดในครั้งเดียว ประหยัดเวลา",
        },
        {
          title: "AI เข้าใจบริบท",
          desc: "การอัปโหลดหลายหน้าช่วยให้ AI เข้าใจเนื้อเรื่อง และแปลได้แม่นยำขึ้น",
        },
        {
          title: "Cloud Storage",
          desc: "บันทึกผลลัพธ์พร้อมระบบหมดอายุอัตโนมัติ เข้าถึงได้จากทุกอุปกรณ์",
        },
        {
          title: "Auto-Save",
          desc: "บันทึกการแก้ไขอัตโนมัติขณะที่คุณกำลังทำงาน ไม่ต้องกลัวข้อมูลหาย",
        },
      ],
    },
    pricing: {
      title: "ราคาที่เข้าใจง่าย",
      subtitle:
        "เลือกแพ็กเกจที่เหมาะกับคุณ ชำระเงินง่ายผ่าน PromptPay หรือบัตรเครดิต โทเคนเข้าทันที",
      free: "สมัครสมาชิกรับฟรี 5 โทเคน (1 โทเคน = 1 รูป)",
      tiers: [
        { name: "Starter", price: "฿99", tokens: "50 รูป", popular: false },
        { name: "Popular", price: "฿299", tokens: "200 รูป", popular: true },
        {
          name: "Best Value",
          price: "฿599",
          tokens: "500 รูป",
          popular: false,
        },
      ],
      choosePlan: "เลือกแพ็กเกจนี้",
      mostPopular: "ยอดนิยม",
    },
    trust: {
      title: "ความน่าเชื่อถือและความปลอดภัย",
      items: [
        "httpOnly cookie auth — โทเคนปลอดภัย ไม่ถูกเปิดเผยผ่าน JavaScript",
        "Sentry error monitoring — ตรวจจับปัญหาและแก้ไขได้อย่างรวดเร็ว",
        "GPU-powered workers — แปลภาษาได้รวดเร็วแม้ภาพความละเอียดสูง",
      ],
    },
    footer: {
      cta: "แปล 5 หน้าแรกของคุณฟรี — ไม่ต้องใช้บัตรเครดิต",
      btn: "เริ่มต้นใช้งานเลย",
      langs:
        "รองรับภาษา: ไทย, อังกฤษ, ญี่ปุ่น, จีน (ตัวย่อ), เกาหลี และอีกกว่า 25 ภาษา",
    },
  },
  en: {
    nav: {
      login: "Login",
      startFree: "Start Free",
      lang: "TH",
      switchLang: "th" as const,
    },
    hero: {
      subhead:
        "Automatically detect, remove, and replace text in manga and comics — preserving the original art. Supports 30+ languages.",
      cta: "Start Translating Free (5 free tokens)",
      before: "Original (JP)",
      after: "Translated (EN)",
    },
    steps: {
      title: "How It Works",
      s1: {
        title: "1. Upload",
        desc: "Drop your manga pages (supports batch upload for better context)",
      },
      s2: {
        title: "2. AI Translates",
        desc: "Our pipeline detects text, removes it cleanly, translates, and renders new text",
      },
      s3: {
        title: "3. Edit & Export",
        desc: "Fine-tune translations in the built-in editor, then download",
      },
    },
    pipeline: {
      title: "AI Pipeline Features (Under the Hood)",
      steps: [
        {
          name: "Text Detection",
          desc: "AI locates every text bubble and sound effect using DBNET/CTD/CRAFT models",
        },
        {
          name: "OCR Recognition",
          desc: "Reads the original text with specialized manga OCR models",
        },
        {
          name: "Smart Inpainting",
          desc: "Removes original text and reconstructs the background art seamlessly (LaMa AI)",
        },
        {
          name: "AI Translation",
          desc: "Translates with context awareness using GPT-4o — understands manga dialogue, slang, and tone",
        },
        {
          name: "Text Rendering",
          desc: "Places translated text with matched font size, color, and position",
        },
      ],
    },
    features: {
      title: "Pro Tools, Easy to Use",
      editor: "Editor Tools",
      project: "Project Management",
      items: [
        {
          title: "Visual Text Editor",
          desc: "Adjust font, size, color, position, alignment, bold/italic, text stroke for every text block",
        },
        {
          title: "Magic Remover",
          desc: "Paint over leftover text or artifacts and AI inpaints them away",
        },
        {
          title: "Manual Translate",
          desc: "Select a missed region and run AI translation on just that area",
        },
        {
          title: "Clone Stamp",
          desc: "Pixel-level background repair by cloning from nearby areas",
        },
        {
          title: "Pen & Eraser",
          desc: "Freehand drawing for annotations or touch-ups",
        },
        { title: "Undo/Redo", desc: "Full history for every action" },
        {
          title: "Batch Export",
          desc: "Download single images or all pages as ZIP",
        },
        {
          title: "Organize by Project",
          desc: "Group manga chapters into projects (up to 5 active)",
        },
        {
          title: "Batch Translation",
          desc: "Upload multiple pages and translate all at once",
        },
        {
          title: "Context-Aware AI",
          desc: "Multi-page upload helps AI understand story context for more accurate translations",
        },
        {
          title: "Cloud Storage",
          desc: "Results saved with auto-expiry, accessible from any device",
        },
        {
          title: "Auto-Save",
          desc: "Edits saved automatically as you work",
        },
      ],
    },
    pricing: {
      title: "Simple Pricing",
      subtitle:
        "Pay via PromptPay QR or Credit/Debit Card. Tokens credited instantly.",
      free: "5 Free Tokens on signup (1 token = 1 image)",
      tiers: [
        {
          name: "Starter",
          price: "฿99",
          tokens: "50 images",
          popular: false,
        },
        {
          name: "Popular",
          price: "฿299",
          tokens: "200 images",
          popular: true,
        },
        {
          name: "Best Value",
          price: "฿599",
          tokens: "500 images",
          popular: false,
        },
      ],
      choosePlan: "Choose Plan",
      mostPopular: "Most Popular",
    },
    trust: {
      title: "Trust & Security",
      items: [
        "httpOnly cookie auth — tokens never exposed to JavaScript",
        "Sentry error monitoring — issues caught and resolved fast",
        "GPU-powered workers — fast translation even at high resolution",
      ],
    },
    footer: {
      cta: "Translate your first 5 pages free — no credit card required.",
      btn: "Get Started",
      langs:
        "Supported Languages: Thai, English, Japanese, Chinese (Simplified), Korean — and 25+ more",
    },
  },
};

type Lang = keyof typeof translations;

export default function LandingPage() {
  const [lang, setLang] = useState<Lang>("th");
  const [sliderPosition, setSliderPosition] = useState(50);
  const t = translations[lang];

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
      className="min-h-screen bg-[#fafbfc] font-[Kanit] text-slate-800 relative overflow-hidden"
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
                Manga Translator
              </span>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setLang(t.nav.switchLang)}
                className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-full"
              >
                <Languages className="w-4 h-4" />
                {t.nav.lang}
              </button>
              <Link
                to="/login"
                className="hidden sm:block text-slate-600 font-medium hover:text-indigo-600 transition-colors"
              >
                {t.nav.login}
              </Link>
              <Link
                to="/login"
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-medium shadow-sm shadow-indigo-200 transition-all hover:-translate-y-0.5"
              >
                {t.nav.startFree}
              </Link>
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
              {lang === "th" ? (
                <>
                  แปลมังงะใน
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">
                    ไม่กี่วินาที
                  </span>
                  <br />
                  ด้วย AI
                </>
              ) : (
                <>
                  Translate Manga in{" "}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">
                    Seconds
                  </span>
                </>
              )}
            </h1>
            <p className="text-lg text-slate-600 leading-relaxed max-w-xl">
              {t.hero.subhead}
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                to="/login"
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-xl font-semibold text-lg shadow-lg shadow-indigo-200 transition-all hover:-translate-y-1 flex justify-center items-center gap-2"
              >
                {t.hero.cta} <ArrowRight className="w-5 h-5" />
              </Link>
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
              {/* Base Image (BEFORE) */}
              <img
                src="/images/before.webp"
                alt="Original manga page"
                className="absolute inset-0 w-full h-full object-cover"
                draggable={false}
              />

              {/* Top Image (AFTER) */}
              <div
                className="absolute inset-0 h-full overflow-hidden"
                style={{
                  clipPath: `polygon(0 0, ${sliderPosition}% 0, ${sliderPosition}% 100%, 0 100%)`,
                }}
              >
                <img
                  src="/images/after.webp"
                  alt="Translated manga page"
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
            <div className="mt-8 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 text-white font-medium text-sm backdrop-blur-sm border border-white/10">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              {t.pricing.free}
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {t.pricing.tiers.map((tier, idx) => (
              <div
                key={idx}
                className={`relative p-8 rounded-3xl transition-transform ${
                  tier.popular
                    ? "bg-indigo-600 transform md:-translate-y-4 shadow-xl shadow-indigo-900/50"
                    : "bg-slate-800/50 border border-slate-700/50 backdrop-blur-sm hover:bg-slate-800"
                }`}
              >
                {tier.popular && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white text-indigo-600 px-4 py-1.5 rounded-full text-xs font-bold tracking-wide shadow-sm">
                    {t.pricing.mostPopular}
                  </div>
                )}
                <h3 className="text-xl font-medium text-white/80 mb-2">
                  {tier.name}
                </h3>
                <div className="flex items-baseline gap-2 mb-8">
                  <span className="text-4xl font-bold">{tier.price}</span>
                  <span
                    className={`text-sm ${tier.popular ? "text-indigo-200" : "text-slate-400"}`}
                  >
                    / {tier.tokens}
                  </span>
                </div>
                <Link
                  to="/login"
                  className={`block w-full py-3.5 rounded-xl font-semibold text-center transition-all ${
                    tier.popular
                      ? "bg-white text-indigo-600 hover:bg-slate-50 shadow-sm"
                      : "bg-white/10 text-white hover:bg-white/20"
                  }`}
                >
                  {t.pricing.choosePlan}
                </Link>
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
            <Link
              to="/login"
              className="inline-block bg-white text-indigo-600 px-10 py-4 rounded-2xl font-semibold text-lg hover:bg-slate-50 shadow-sm transition-transform hover:-translate-y-1 relative z-10"
            >
              {t.footer.btn}
            </Link>
          </div>

          <div className="mt-16 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-slate-500">
            <div className="flex items-center gap-2 text-slate-900 text-lg font-semibold">
              <div className="bg-indigo-600 p-1.5 rounded-lg">
                <Languages className="w-4 h-4 text-white" />
              </div>
              Manga Translator
            </div>
            <p>
              &copy; {new Date().getFullYear()} Manga Translator. All rights
              reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
