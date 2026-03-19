import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  Coins,
  Plus,
  Trash2,
  Loader2,
  FolderOpen,
  Image as ImageIcon,
  Clock,
  Inbox,
  X,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import type { Project } from "@/types";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/utils/api";

type Locale = "th" | "en";
const t = {
  th: {
    projects: "โปรเจกต์",
    createProject: "สร้างโปรเจกต์",
    projectName: "ชื่อโปรเจกต์",
    noProjects: "ยังไม่มีโปรเจกต์",
    noProjectsDesc: "สร้างโปรเจกต์เพื่อเริ่มแปลมังงะ",
    create: "สร้าง",
    cancel: "ยกเลิก",
    daysLeft: "เหลือ {n} วัน",
    deleteProject: "ลบโปรเจกต์",
    confirmDelete: "คุณแน่ใจหรือไม่ว่าต้องการลบโปรเจกต์นี้?",
    images: "รูป",
    maxProjects: "คุณมีโปรเจกต์ได้สูงสุด 5 โปรเจกต์ กรุณาลบโปรเจกต์เก่าก่อน",
    adminUnlimited: "ผู้ดูแล (ไม่จำกัด)",
    tokens: "โทเค็น",
    signOut: "ออกจากระบบ",
    profile: "โปรไฟล์",
    subscription: "แพ็กเกจสมาชิก",
    tokenUsage: "การใช้โทเค็น",
    loading: "กำลังโหลด...",
    welcomeTitle: "ยินดีต้อนรับ! คุณได้รับ 5 โทเค็นฟรี",
    welcomeDesc: "แปลมังงะได้ฟรี 5 รูปเลย — สร้างโปรเจกต์แรกของคุณเพื่อเริ่มต้น!",
    dismiss: "เข้าใจแล้ว",
  },
  en: {
    projects: "Projects",
    createProject: "Create Project",
    projectName: "Project Name",
    noProjects: "No projects yet",
    noProjectsDesc: "Create a project to start translating manga",
    create: "Create",
    cancel: "Cancel",
    daysLeft: "{n} days left",
    deleteProject: "Delete Project",
    confirmDelete: "Are you sure you want to delete this project?",
    images: "images",
    maxProjects: "Maximum 5 active projects. Please delete an old project first.",
    adminUnlimited: "Admin (Unlimited)",
    tokens: "Tokens",
    signOut: "Sign out",
    profile: "Profile",
    subscription: "Subscription",
    tokenUsage: "Token Usage",
    loading: "Loading...",
    welcomeTitle: "Welcome! You got 5 free tokens",
    welcomeDesc: "Translate 5 manga images for free — create your first project to get started!",
    dismiss: "Got it",
  },
} as const;

export const App: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();

  const [locale, setLocale] = useState<Locale>(() => (localStorage.getItem("manga-translator-locale") as Locale) || "th");
  const i = t[locale];

  const [showWelcome, setShowWelcome] = useState(() => {
    if (typeof window === "undefined") return false;
    return !localStorage.getItem("manga-translator-welcome-dismissed");
  });
  const dismissWelcome = () => {
    setShowWelcome(false);
    localStorage.setItem("manga-translator-welcome-dismissed", "1");
  };

  useEffect(() => {
    localStorage.setItem("manga-translator-locale", locale);
  }, [locale]);

  // Project state
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const fetchProjects = async () => {
    if (!user) return;
    try {
      const res = await apiFetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        setProjectList(data);
      }
    } catch {
      // silent
    } finally {
      setLoadingProjects(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [user]);

  const handleCreateProject = async () => {
    if (!newProjectName.trim() || !user) return;
    setCreating(true);
    setCreateError("");
    try {
      const res = await apiFetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newProjectName.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed" }));
        setCreateError(err.detail || "Failed to create project");
        return;
      }
      const project = await res.json();
      setShowCreateModal(false);
      setNewProjectName("");
      navigate(`/studio/projects/${project.id}`);
    } catch {
      setCreateError("Network error");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm(i.confirmDelete)) return;
    if (!user) return;
    try {
      await apiFetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });
      setProjectList((prev) => prev.filter((p) => p.id !== projectId));
    } catch {
      // silent
    }
  };

  const getDaysLeft = (expiresAt: string) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = Math.max(0, Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    return diff;
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      <Navbar showLanguageToggle locale={locale} onLocaleChange={setLocale} />

      {/* Main Content — Project List */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          {/* Welcome banner for new users */}
          {showWelcome && !isAdmin && (
            <div className="mb-6 bg-gradient-to-r from-indigo-50 to-emerald-50 border border-indigo-200 rounded-2xl p-5 flex items-start gap-4">
              <div className="bg-emerald-100 w-10 h-10 rounded-xl flex items-center justify-center shrink-0">
                <Coins className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-slate-800">{i.welcomeTitle}</h3>
                <p className="text-xs text-slate-500 mt-1">{i.welcomeDesc}</p>
              </div>
              <button onClick={dismissWelcome} className="p-1 text-slate-400 hover:text-slate-600 transition-colors shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          <div className="flex items-end justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">{i.projects}</h2>
            </div>
            <button
              onClick={() => { setShowCreateModal(true); setCreateError(""); setNewProjectName(""); }}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all"
            >
              <Plus className="w-4 h-4" /> {i.createProject}
            </button>
          </div>

          {loadingProjects ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
            </div>
          ) : projectList.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Inbox className="w-8 h-8 text-slate-300" />
              </div>
              <h3 className="text-lg font-bold text-slate-600 mb-2">{i.noProjects}</h3>
              <p className="text-sm text-slate-400 max-w-sm mx-auto">{i.noProjectsDesc}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projectList.map((project) => {
                const daysLeft = getDaysLeft(project.expires_at);
                return (
                  <div
                    key={project.id}
                    onClick={() => navigate(`/studio/projects/${project.id}`)}
                    className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group"
                  >
                    {/* Thumbnail */}
                    <div className="h-40 bg-slate-100 flex items-center justify-center overflow-hidden">
                      {project.thumbnail_url ? (
                        <img src={project.thumbnail_url} alt={project.name} loading="lazy" className="w-full h-full object-cover" />
                      ) : (
                        <FolderOpen className="w-10 h-10 text-slate-300" />
                      )}
                    </div>
                    {/* Info */}
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="text-sm font-bold text-slate-700 truncate flex-1">{project.name}</h3>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteProject(project.id); }}
                          className="p-1 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <ImageIcon className="w-3 h-3" /> {project.image_count} {i.images}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {i.daysLeft.replace("{n}", String(daysLeft))}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800">{i.createProject}</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-slate-600 mb-1 block">{i.projectName}</label>
                <input
                  type="text"
                  autoFocus
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreateProject(); }}
                  placeholder={locale === "th" ? "เช่น วันพีซ ตอน 1-10" : "e.g. One Piece Ch 1-10"}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none"
                />
              </div>
              {createError && (
                <p className="text-sm text-red-500">{createError}</p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-200 transition-colors"
                >
                  {i.cancel}
                </button>
                <button
                  onClick={handleCreateProject}
                  disabled={creating || !newProjectName.trim()}
                  className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                  {i.create}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
