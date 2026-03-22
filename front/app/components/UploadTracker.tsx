import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, X, Check, AlertCircle, Loader2 } from "lucide-react";
import type { UploadFileTracker } from "@/types";

interface UploadTrackerProps {
  files: UploadFileTracker[];
  onDismiss: () => void;
  title: string;
  completeText: string;
  failedText: string;
}

export function UploadTracker({ files, onDismiss, title, completeText, failedText }: UploadTrackerProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [autoDismissed, setAutoDismissed] = useState(false);

  const allDone = files.length > 0 && files.every((f) => f.status !== "uploading");
  const hasErrors = files.some((f) => f.status === "error");
  const successCount = files.filter((f) => f.status === "success").length;
  const uploadingCount = files.filter((f) => f.status === "uploading").length;

  useEffect(() => {
    if (allDone && !hasErrors && !autoDismissed) {
      const timer = setTimeout(() => {
        setAutoDismissed(true);
        onDismiss();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [allDone, hasErrors, autoDismissed, onDismiss]);

  if (files.length === 0) return null;

  const headerText = allDone
    ? hasErrors ? failedText : completeText
    : title.replace("{count}", String(uploadingCount || files.length));

  return (
    <div className="fixed bottom-4 left-4 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100 cursor-pointer"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2 min-w-0">
          {!allDone && <Loader2 className="w-4 h-4 text-indigo-500 animate-spin flex-shrink-0" />}
          {allDone && !hasErrors && <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
          {allDone && hasErrors && <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
          <span className="text-sm font-semibold text-slate-700 truncate">{headerText}</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {collapsed ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          <button onClick={(e) => { e.stopPropagation(); onDismiss(); }} className="p-0.5 hover:bg-slate-200 rounded">
            <X className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
      </div>

      {/* File list */}
      {!collapsed && (
        <div className="max-h-48 overflow-y-auto divide-y divide-slate-50">
          {files.map((f) => (
            <div key={f.id} className="px-4 py-2.5 flex items-center gap-3">
              <div className="flex-grow min-w-0">
                <p className="text-xs font-medium text-slate-600 truncate">{f.filename}</p>
                <div className="mt-1 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      f.status === "error" ? "bg-red-400" :
                      f.status === "success" ? "bg-emerald-500" : "bg-indigo-500"
                    }`}
                    style={{ width: `${f.status === "success" ? 100 : f.status === "error" ? 100 : f.progress}%` }}
                  />
                </div>
              </div>
              <div className="flex-shrink-0 w-5">
                {f.status === "uploading" && <span className="text-[10px] text-slate-400">{Math.round(f.progress)}%</span>}
                {f.status === "success" && <Check className="w-4 h-4 text-emerald-500" />}
                {f.status === "error" && <AlertCircle className="w-4 h-4 text-red-500" />}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary bar */}
      {allDone && !collapsed && (
        <div className="px-4 py-2 bg-slate-50 border-t border-slate-100">
          <p className="text-[10px] text-slate-500">
            {successCount}/{files.length} uploaded successfully
          </p>
        </div>
      )}
    </div>
  );
}
