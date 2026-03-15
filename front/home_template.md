import React, { useState, useEffect } from 'react';
import {
BookOpen,
User,
LogOut,
Coins,
Settings2,
Upload,
Image as ImageIcon,
X,
Play,
Trash2,
CheckCircle2,
Loader2,
Languages,
Focus,
Maximize,
Layers,
Brush,
MoveRight,
AlertCircle,
ExternalLink,
History,
LayoutDashboard
} from 'lucide-react';

// --- Mock Constants ---
const DETECTORS = ['DBNET', 'CTD', 'Default'];
const TRANSLATORS = ['OpenAI', 'Youdao', 'ChatGPT', 'Gemini', 'DeepL'];
const LANGUAGES = ['Thai', 'English', 'Japanese', 'Chinese', 'Spanish'];
const INPAINTERS = ['Default', 'PatchMatch', 'A-Inpainter'];

const App = () => {
const [user, setUser] = useState({ email: 'xepemi5364@niprack.com', isAdmin: true, tokens: 0 });
const [images, setImages] = useState([]);
const [isProcessing, setIsProcessing] = useState(false);
const [gallery, setGallery] = useState([]);

// Configuration State
const [settings, setSettings] = useState({
textDetector: 'Default',
resolution: '1536px',
boxThreshold: 0.7,
unclipRatio: 2.3,
dilationOffset: 30,
translator: 'OpenAI',
targetLang: 'Thai',
inpainter: 'Default',
inpaintingSize: '2048px',
renderDirection: 'Auto'
});

// Persist Gallery
useEffect(() => {
const saved = localStorage.getItem('manga-translator-gallery');
if (saved) setGallery(JSON.parse(saved));
}, []);

useEffect(() => {
localStorage.setItem('manga-translator-gallery', JSON.stringify(gallery));
}, [gallery]);

// Clipboard Paste Support
useEffect(() => {
const handlePaste = (e) => {
const items = e.clipboardData.items;
for (let i = 0; i < items.length; i++) {
if (items[i].type.indexOf('image') !== -1) {
addImagesToQueue([items[i].getAsFile()]);
}
}
};
window.addEventListener('paste', handlePaste);
return () => window.removeEventListener('paste', handlePaste);
}, []);

const addImagesToQueue = (files) => {
const newImages = Array.from(files).map(file => ({
id: Math.random().toString(36).substr(2, 9),
name: file.name || `Pasted Image ${new Date().toLocaleTimeString()}`,
file,
status: 'pending',
progress: 0,
resultUrl: null
}));
setImages(prev => [...prev, ...newImages]);
};

const startTranslation = async () => {
if (images.length === 0) return;
setIsProcessing(true);
for (const img of images) {
if (img.status === 'finished') continue;
const steps = ['detection', 'ocr', 'translating', 'rendering', 'finished'];
for (let i = 0; i < steps.length; i++) {
setImages(prev => prev.map(item => item.id === img.id ? { ...item, status: steps[i], progress: (i + 1) \* 20 } : item));
await new Promise(r => setTimeout(r, 600));
}
const mockUrl = "https://images.unsplash.com/photo-1614850523296-d8c1af93d400?q=80&w=2070&auto=format&fit=crop";
setImages(prev => prev.map(item => item.id === img.id ? { ...item, resultUrl: mockUrl } : item));
setGallery(prev => [{ ...img, resultUrl: mockUrl, status: 'finished', date: new Date().toISOString() }, ...prev]);
}
setIsProcessing(false);
};

return (
<div className="flex flex-col h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
{/_ Top Header _/}
<header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between z-30 shrink-0">
<div className="flex items-center gap-3">
<div className="bg-indigo-600 p-1.5 rounded-lg">
<BookOpen className="text-white w-5 h-5" />
</div>
<h1 className="text-lg font-bold tracking-tight text-slate-800">Manga Translator</h1>
</div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 border border-emerald-100 rounded-full">
            <Coins className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-xs font-semibold text-emerald-700">
              {user.isAdmin ? 'Admin (Unlimited)' : `${user.tokens} Tokens`}
            </span>
          </div>
          <div className="h-6 w-px bg-slate-200" />
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500 hidden sm:inline">{user.email}</span>
            <button className="p-1.5 hover:bg-slate-100 rounded-full transition-colors group">
              <LogOut className="w-4 h-4 text-slate-400 group-hover:text-red-500" />
            </button>
          </div>
        </div>
      </header>

      {/* Workspace */}
      <div className="flex flex-1 overflow-hidden">

        {/* Main Content Area (Left) */}
        <main className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Welcome/Stats */}
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Workspace</h2>
              <p className="text-sm text-slate-500">Manage your translation queue and review results.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setImages([])}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-sm"
              >
                <Trash2 className="w-4 h-4" /> Clear
              </button>
              <button
                onClick={startTranslation}
                disabled={isProcessing || images.length === 0}
                className="flex items-center gap-2 px-6 py-2 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all disabled:opacity-50"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                Run Translation
              </button>
            </div>
          </div>

          {/* Dropzone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); addImagesToQueue(e.dataTransfer.files); }}
            className="relative group border-2 border-dashed border-slate-200 hover:border-indigo-400 bg-white hover:bg-indigo-50/20 rounded-2xl p-12 transition-all cursor-pointer text-center"
          >
            <input type="file" multiple accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => addImagesToQueue(e.target.files)} />
            <div className="max-w-xs mx-auto space-y-3 pointer-events-none">
              <div className="bg-slate-50 group-hover:bg-indigo-100 w-14 h-14 rounded-2xl flex items-center justify-center mx-auto transition-colors">
                <Upload className="w-6 h-6 text-slate-400 group-hover:text-indigo-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-700">Drop your manga pages here</p>
                <p className="text-xs text-slate-400 mt-1">Supports batch upload and Ctrl+V clipboard paste</p>
              </div>
            </div>
          </div>

          {/* Queue List */}
          {images.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <LayoutDashboard className="w-4 h-4" /> Queue ({images.length})
              </h3>
              <div className="grid grid-cols-1 gap-3">
                {images.map((img) => (
                  <div key={img.id} className="bg-white border border-slate-200 p-4 rounded-xl flex items-center gap-4 group hover:border-indigo-200 transition-all">
                    <div className="w-10 h-14 bg-slate-100 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden border border-slate-100">
                      <ImageIcon className="text-slate-300 w-5 h-5" />
                    </div>
                    <div className="flex-grow min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-sm font-bold truncate text-slate-700">{img.name}</p>
                        <span className="text-[10px] font-black uppercase bg-slate-100 px-2 py-0.5 rounded text-slate-500">{img.status}</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${img.progress}%` }} />
                      </div>
                    </div>
                    {img.status === 'finished' && (
                      <button className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors">
                        <ExternalLink className="w-3.5 h-3.5" /> Editor
                      </button>
                    )}
                    <button onClick={() => setImages(prev => prev.filter(i => i.id !== img.id))} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Results Gallery Section */}
          {gallery.length > 0 && (
            <div className="pt-8 border-t border-slate-200">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2 mb-4">
                <History className="w-4 h-4" /> Recent Translations
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {gallery.map((item, idx) => (
                  <div key={idx} className="group relative bg-white border border-slate-200 rounded-xl overflow-hidden aspect-[3/4] shadow-sm hover:shadow-md transition-all">
                    <img src={item.resultUrl} alt="Result" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-4 gap-2">
                      <button className="w-full bg-white text-slate-900 text-xs font-bold py-2 rounded-lg">Open Editor</button>
                      <button className="w-full bg-indigo-600 text-white text-xs font-bold py-2 rounded-lg">Download</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>

        {/* Configuration Sidebar (Right) */}
        <aside className="w-80 bg-white border-l border-slate-200 flex flex-col shadow-[-4px_0_15px_rgba(0,0,0,0.02)] z-20 overflow-y-auto">
          <div className="p-4 border-b border-slate-100 flex items-center gap-2 bg-slate-50/50 sticky top-0 z-10">
            <Settings2 className="w-4 h-4 text-slate-500" />
            <h2 className="font-bold text-sm text-slate-700 uppercase tracking-tight">Configuration</h2>
          </div>

          <div className="p-5 space-y-8">
            {/* Detection Group */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <Focus className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-[11px] font-bold text-slate-400 uppercase">Detection</span>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">Text Detector</label>
                <select
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none"
                  value={settings.textDetector}
                  onChange={(e) => setSettings({...settings, textDetector: e.target.value})}
                >
                  {DETECTORS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">Resolution</label>
                <div className="relative">
                  <input
                    type="text"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm pl-8"
                    value={settings.resolution}
                    onChange={(e) => setSettings({...settings, resolution: e.target.value})}
                  />
                  <Maximize className="w-3.5 h-3.5 text-slate-300 absolute left-2.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>
            </div>

            {/* Translation Group */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <Languages className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-[11px] font-bold text-slate-400 uppercase">Translation</span>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">Engine</label>
                <select className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm" value={settings.translator} onChange={(e) => setSettings({...settings, translator: e.target.value})}>
                  {TRANSLATORS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">Target Language</label>
                <div className="relative">
                  <select className="w-full bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 text-sm font-bold text-indigo-600 appearance-none" value={settings.targetLang} onChange={(e) => setSettings({...settings, targetLang: e.target.value})}>
                    {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                  <MoveRight className="w-3.5 h-3.5 text-indigo-300 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Visual Group */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <Layers className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-[11px] font-bold text-slate-400 uppercase">Visuals</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold text-slate-600">Box Threshold</label>
                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 rounded">{settings.boxThreshold}</span>
                </div>
                <input
                  type="range" min="0" max="1" step="0.1"
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  value={settings.boxThreshold}
                  onChange={(e) => setSettings({...settings, boxThreshold: parseFloat(e.target.value)})}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">Inpainter</label>
                <select className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm" value={settings.inpainter} onChange={(e) => setSettings({...settings, inpainter: e.target.value})}>
                  {INPAINTERS.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
            </div>

            {/* Advanced Section Footer */}
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <div className="bg-amber-50 border border-amber-100 p-3 rounded-lg flex gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                <p className="text-[10px] text-amber-700 leading-normal">
                  Higher resolution improves OCR accuracy but increases token consumption.
                </p>
              </div>
              <button className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-colors">
                Reset to Default
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* Mini Footer / Status Bar */}
      <footer className="h-8 bg-slate-100 border-t border-slate-200 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> API: Connected
          </span>
          <span className="text-[10px] font-bold text-slate-400">Ver 2.4.1</span>
        </div>
        <div className="text-[10px] font-medium text-slate-400">
          Last processed: {gallery[0]?.name || 'No recent activity'}
        </div>
      </footer>
    </div>

);
};

export default App;
