import { Link } from "react-router";
import {
  BookOpen,
  Languages,
  Sparkles,
  Pencil,
  Eraser,
  ScanSearch,
  Stamp,
  FolderOpen,
  Coins,
  Download,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

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

const features = [
  {
    section: "AI Translation Pipeline",
    items: [
      {
        icon: ScanSearch,
        title: "Text Detection & OCR",
        desc: "Automatically detect and read text in manga panels with state-of-the-art AI models.",
      },
      {
        icon: Sparkles,
        title: "AI Inpainting",
        desc: "Cleanly remove original text from images, preserving artwork underneath.",
      },
      {
        icon: Languages,
        title: "Multi-Language Translation",
        desc: "Translate between 30+ languages with AI backends including ChatGPT and DeepL.",
      },
      {
        icon: BookOpen,
        title: "Context-Aware Rendering",
        desc: "Render translated text with proper typography, direction, and font sizing.",
      },
    ],
  },
  {
    section: "Editing & Management",
    items: [
      {
        icon: Pencil,
        title: "Built-in Editor",
        desc: "Fine-tune translations, adjust text blocks, and fix rendering issues interactively.",
      },
      {
        icon: Eraser,
        title: "Manual Cleanup Tools",
        desc: "Pen, eraser, clone stamp, and magic remover tools for pixel-perfect results.",
      },
      {
        icon: FolderOpen,
        title: "Project Management",
        desc: "Organize your manga chapters into projects. Batch translate and track progress.",
      },
      {
        icon: Download,
        title: "Export & Share",
        desc: "Export individual images or batch download entire projects as ZIP archives.",
      },
    ],
  },
];

const pipelineSteps = [
  "Text Detection",
  "OCR Recognition",
  "AI Translation",
  "Inpainting",
  "Text Rendering",
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900 font-[Kanit]">
      {/* Navbar */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-slate-100">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-16">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-1.5 rounded-lg">
              <BookOpen className="text-white w-5 h-5" />
            </div>
            <span className="text-lg font-bold tracking-tight text-slate-800">
              Manga Translator
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
            >
              Sign In
            </Link>
            <Link
              to="/login"
              className="px-5 py-2 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-white to-emerald-50" />
        <div className="relative max-w-6xl mx-auto px-6 py-24 md:py-32">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6 leading-tight">
              Translate Manga & Webtoons{" "}
              <span className="text-indigo-600">with AI</span>
            </h1>
            <p className="text-lg text-slate-500 mb-8 max-w-2xl mx-auto">
              Detect text, remove it cleanly, translate into 30+ languages, and
              render — all automatically. Then fine-tune with our built-in
              editor.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 px-8 py-3 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
              >
                Start Translating <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="#features"
                className="px-6 py-3 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
              >
                Learn More
              </a>
            </div>
          </div>

          {/* Before / After showcase */}
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-slate-200 to-slate-300 rounded-2xl opacity-50 group-hover:opacity-75 transition-opacity blur" />
                <div className="relative bg-slate-100 rounded-2xl overflow-hidden aspect-[3/4] flex items-center justify-center border border-slate-200">
                  <img
                    src="/manga-before.jpg"
                    alt="Original manga page in Japanese"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
                    <p className="text-sm font-semibold text-slate-400">Original (Before)</p>
                    <p className="text-xs text-slate-300">Place manga-before.jpg in public/</p>
                  </div>
                </div>
                <div className="absolute top-4 left-4 px-3 py-1 bg-white/90 backdrop-blur rounded-full text-xs font-bold text-slate-600 shadow">
                  Before
                </div>
              </div>
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-indigo-200 to-emerald-200 rounded-2xl opacity-50 group-hover:opacity-75 transition-opacity blur" />
                <div className="relative bg-slate-100 rounded-2xl overflow-hidden aspect-[3/4] flex items-center justify-center border border-indigo-200">
                  <img
                    src="/manga-after.jpg"
                    alt="Translated manga page in Thai"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
                    <p className="text-sm font-semibold text-indigo-400">Translated (After)</p>
                    <p className="text-xs text-slate-300">Place manga-after.jpg in public/</p>
                  </div>
                </div>
                <div className="absolute top-4 left-4 px-3 py-1 bg-indigo-600/90 backdrop-blur rounded-full text-xs font-bold text-white shadow">
                  After
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pipeline steps */}
      <section className="py-16 bg-slate-50 border-y border-slate-100">
        <div className="max-w-4xl mx-auto px-6">
          <p className="text-center text-sm font-bold text-slate-400 uppercase tracking-wider mb-8">
            Full AI Pipeline — Every Image Gets
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {pipelineSteps.map((step, idx) => (
              <span
                key={step}
                className="flex items-center gap-2 text-sm text-slate-600 bg-white border border-slate-200 px-4 py-2 rounded-full shadow-sm"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                {step}
                {idx < pipelineSteps.length - 1 && (
                  <ArrowRight className="w-3 h-3 text-slate-300 ml-1" />
                )}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              Everything You Need
            </h2>
            <p className="text-slate-500 max-w-lg mx-auto">
              From automatic AI translation to pixel-perfect manual editing —
              all in one tool.
            </p>
          </div>

          <div className="space-y-20">
            {features.map((group) => (
              <div key={group.section}>
                <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-wider mb-8 text-center">
                  {group.section}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {group.items.map((feature) => {
                    const Icon = feature.icon;
                    return (
                      <div
                        key={feature.title}
                        className="flex gap-4 p-6 bg-white border border-slate-200 rounded-2xl hover:border-indigo-200 hover:shadow-md transition-all"
                      >
                        <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center shrink-0">
                          <Icon className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-800 mb-1">
                            {feature.title}
                          </h4>
                          <p className="text-sm text-slate-500">
                            {feature.desc}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing hint */}
      <section className="py-20 bg-gradient-to-br from-indigo-600 to-indigo-700">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Coins className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-4">
            Start with 5 Free Tokens
          </h2>
          <p className="text-indigo-200 mb-8 max-w-lg mx-auto">
            Every new account gets 5 free tokens — that's 5 manga pages
            translated with the full AI pipeline. No credit card required.
          </p>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 px-8 py-3 text-sm font-bold text-indigo-600 bg-white rounded-xl hover:bg-indigo-50 transition-colors shadow-lg"
          >
            Create Free Account <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 bg-slate-50 border-t border-slate-100">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <div className="bg-indigo-600 p-1 rounded">
              <BookOpen className="text-white w-3.5 h-3.5" />
            </div>
            Manga Translator
          </div>
          <p className="text-xs text-slate-400">
            &copy; {new Date().getFullYear()} Manga Translator. All rights
            reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
