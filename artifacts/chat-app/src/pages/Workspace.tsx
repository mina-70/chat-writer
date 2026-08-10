import { useEffect, useMemo, useRef, useState, useCallback, type FormEvent } from "react";

import type { SpeechRecognitionInstance, SpeechRecognitionResultEvent } from "@/lib/speech-types";
import "@/lib/speech-types";
import { api, type ChatMessage } from "@/lib/api";
import { Maximize2, Minimize2, ExternalLink, Mic } from "lucide-react";
import RichEditor, { type RichEditorHandle, type DocFormat, DOC_FORMATS } from "@/components/RichEditor";
import abyAvatar from "@/assets/aby.png";

import abmLogo from "@/assets/abm-logo.png";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { detectJournal } from "@/lib/journals";

interface Props {
  onLogout: () => void;
}

interface Project {
  id: string;
  name: string;
  content: string;
  text?: string;
  format?: DocFormat;
  messages: ChatMessage[];
  updatedAt: number;
}

const PROJECTS_KEY = "chat-writer.projects";
const ACTIVE_KEY = "chat-writer.activeId";
const LEGACY_FILES_KEY = "chat-writer.files";


function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .filter(
            (p): p is Project =>
              p &&
              typeof p.id === "string" &&
              typeof p.name === "string" &&
              typeof p.content === "string",
          )
          .map((p) => ({
            ...p,
            messages: Array.isArray(p.messages) ? p.messages : [],
            updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : Date.now(),
          }));
      }
    }

    const legacy = localStorage.getItem(LEGACY_FILES_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (Array.isArray(parsed)) {
        const migrated: Project[] = parsed
          .filter(
            (d) =>
              d &&
              typeof d.id === "string" &&
              typeof d.name === "string" &&
              typeof d.content === "string",
          )
          .map((d) => ({
            id: d.id,
            name: d.name,
            content: d.content,
            messages: [],
            updatedAt: typeof d.updatedAt === "number" ? d.updatedAt : Date.now(),
          }));
        try {
          localStorage.removeItem(LEGACY_FILES_KEY);
        } catch {
          /* ignore */
        }
        if (migrated.length > 0) return migrated;
      }
    }
    return [];
  } catch {
    return [];
  }
}

function loadActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export default function Workspace({ onLogout }: Props) {
  const [projects, setProjects] = useState<Project[]>(() => {
    const existing = loadProjects();
    if (existing.length > 0) return existing;
    return [
      {
        id: uid(),
        name: "Untitled project",
        content: "",
        messages: [],
        updatedAt: Date.now(),
      },
    ];
  });
  const [activeId, setActiveId] = useState<string>(() => loadActiveId() ?? "");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [recording, setRecording] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<RichEditorHandle>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
  }, []);

  useEffect(() => {
    if (!activeId || !projects.some((p) => p.id === activeId)) {
      const first = projects[0];
      if (first) setActiveId(first.id);
    }
  }, [projects, activeId]);

  useEffect(() => {
    try {
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
    } catch {
      /* ignore */
    }
  }, [projects]);

  useEffect(() => {
    try {
      if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
    } catch {
      /* ignore */
    }
  }, [activeId]);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeId) ?? projects[0],
    [projects, activeId],
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeProject?.messages, sending]);

  function updateActiveProject(patch: Partial<Project>) {
    if (!activeProject) return;
    setProjects((prev) =>
      prev.map((p) =>
        p.id === activeProject.id
          ? { ...p, ...patch, updatedAt: Date.now() }
          : p,
      ),
    );
  }

  function createProject() {
    const project: Project = {
      id: uid(),
      name: "Untitled project",
      content: "",
      messages: [],
      updatedAt: Date.now(),
    };
    setProjects((prev) => [project, ...prev]);
    setActiveId(project.id);
    setError(null);
  }

  function deleteProject(id: string) {
    setProjects((prev) => {
      const next = prev.filter((p) => p.id !== id);
      if (next.length === 0) {
        const fresh: Project = {
          id: uid(),
          name: "Untitled project",
          content: "",
          messages: [],
          updatedAt: Date.now(),
        };
        setActiveId(fresh.id);
        return [fresh];
      }
      if (id === activeId) setActiveId(next[0].id);
      return next;
    });
  }

  function startRename(project: Project) {
    setRenamingId(project.id);
    setRenameValue(project.name);
  }

  function commitRename() {
    if (!renamingId) return;
    const trimmed = renameValue.trim() || "Untitled project";
    setProjects((prev) =>
      prev.map((p) =>
        p.id === renamingId ? { ...p, name: trimmed, updatedAt: Date.now() } : p,
      ),
    );
    setRenamingId(null);
    setRenameValue("");
  }

  function clearActiveChat() {
    if (!activeProject) return;
    updateActiveProject({ messages: [] });
    setError(null);
  }

  const toggleMic = useCallback(() => {
    const SpeechRecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      alert("Speech recognition isn't supported in this browser. Try Chrome or Edge.");
      return;
    }
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }
    const rec = new SpeechRecognitionCtor();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (event: SpeechRecognitionResultEvent) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) transcript += event.results[i][0].transcript;
      }
      if (transcript) setInput((prev) => (prev ? prev + " " + transcript.trim() : transcript.trim()));
    };
    rec.onerror = () => setRecording(false);
    rec.onend = () => setRecording(false);
    recognitionRef.current = rec;
    rec.start();
    setRecording(true);
  }, [recording]);

  const insertIntoEditor = useCallback((text: string) => {
    editorRef.current?.insertAtCursor(text);
  }, []);

  async function handleLogout() {
    try {
      await api.logout();
    } finally {
      onLogout();
    }
  }

  function appendSystemMessage(content: string) {
    if (!activeProject) return;
    const projectId = activeProject.id;
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? {
              ...p,
              messages: [...p.messages, { role: "assistant", content }],
              updatedAt: Date.now(),
            }
          : p,
      ),
    );
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!activeProject) return;
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    const journal = detectJournal(trimmed);
    const currentFormat = activeProject.format ?? "none";
    let appliedFormatNote = "";
    if (journal && journal.format !== currentFormat) {
      updateActiveProject({ format: journal.format });
      appliedFormatNote = `📄 Detected **${journal.outlet}** — switched the document format to **${journal.formatLabel}** (${DOC_FORMATS[journal.format]?.hint ?? ""}).`;
    }

    const next: ChatMessage[] = [
      ...activeProject.messages,
      { role: "user", content: trimmed },
    ];
    const projectId = activeProject.id;
    updateActiveProject({ messages: next });
    setInput("");
    setSending(true);
    setError(null);

    try {
      const { reply } = await api.chat(next);
      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectId
            ? {
                ...p,
                messages: [
                  ...next,
                  { role: "assistant", content: reply || "(empty response)" },
                ],
                updatedAt: Date.now(),
              }
            : p,
        ),
      );
      if (appliedFormatNote) {
        appendSystemMessage(appliedFormatNote);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      if (err instanceof Error && (err as Error & { status?: number }).status === 401) {
        onLogout();
      }
    } finally {
      setSending(false);
    }
  }

  const plainText =
    activeProject?.text ??
    (activeProject?.content
      ? activeProject.content.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ")
      : "");
  const wordCount = plainText.trim().length
    ? plainText.trim().split(/\s+/).length
    : 0;

  return (
    <div className="h-screen w-full flex flex-col" style={{ background: "#FAF5E9", color: "#2C2415" }}>

      {/* ── A Brilliant Mind top header ── */}
      <div style={{ background: "#FFFFFF", borderBottom: "1px solid #EDE0C4", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 32px" }}>
          <div>
            <img src={abmLogo} alt="A Brilliant Mind" style={{ height: "52px", objectFit: "contain", display: "block" }} />
          </div>
          <nav style={{ display: "flex", alignItems: "center", gap: "24px" }}>
            <a href="#" style={{ fontSize: "13px", color: "#555", textDecoration: "none" }}>Newsletter</a>
            <a href="#" style={{ fontSize: "13px", color: "#555", textDecoration: "none" }}>About me</a>
            <button style={{ background: "#F2C45A", borderRadius: "20px", padding: "5px 18px", border: "none", fontSize: "13px", cursor: "pointer", color: "#2C2415", fontWeight: 500 }}>
              Contact
            </button>
          </nav>
        </div>
        {/* Teal + salmon accent bar */}
        <div style={{ height: "4px", display: "flex" }}>
          <div style={{ flex: 1, background: "#7ECECE" }} />
          <div style={{ flex: 1, background: "#F09090" }} />
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
      {/* LEFT: Projects */}
      {!chatExpanded && (
        sidebarCollapsed ? (
          /* Collapsed sidebar — thin strip with toggle */
          <aside className="w-[40px] shrink-0 border-r bg-card flex flex-col items-center pt-3" style={{ gap: "12px" }}>
            <button
              type="button"
              onClick={() => setSidebarCollapsed(false)}
              title="Expand sidebar"
              className="text-muted-foreground hover:text-foreground transition"
              style={{ fontSize: "16px", lineHeight: 1, background: "none", border: "none", cursor: "pointer" }}
            >
              ›
            </button>
          </aside>
        ) : (
        <aside className="w-[280px] shrink-0 border-r bg-card flex flex-col">
        <header className="h-12 px-4 flex items-center justify-between border-b">
          <span className="text-sm font-semibold">Projects</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSidebarCollapsed(true)}
              title="Collapse sidebar"
              className="text-xs text-muted-foreground hover:text-foreground px-1 transition"
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px", lineHeight: 1 }}
            >
              ‹
            </button>
            <button
              type="button"
              onClick={createProject}
              className="text-xs h-7 px-2 rounded-md border bg-background hover:bg-muted transition"
            >
              + New
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {projects.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-8">
              No projects yet
            </div>
          )}
          {projects.map((project) => {
            const isActive = project.id === activeId;
            const isRenaming = renamingId === project.id;
            return (
              <div
                key={project.id}
                className={
                  "group flex items-center gap-2 rounded-md px-2 py-2 text-sm cursor-pointer " +
                  (isActive
                    ? "bg-primary/10 text-foreground"
                    : "hover:bg-muted text-foreground")
                }
                onClick={() => !isRenaming && setActiveId(project.id)}
              >
                <span className="text-muted-foreground text-xs">📁</span>
                <div className="flex-1 min-w-0">
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") {
                          setRenamingId(null);
                          setRenameValue("");
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full bg-background border rounded px-1 py-0.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                    />
                  ) : (
                    <>
                      <div
                        className="truncate"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          startRename(project);
                        }}
                      >
                        {project.name}
                      </div>
                    </>
                  )}
                </div>
                <div className="flex items-center opacity-0 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      startRename(project);
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground px-1"
                    title="Rename"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteProject(project.id);
                    }}
                    className="text-xs text-muted-foreground hover:text-destructive px-1"
                    title="Delete"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </aside>
      ))}

      {/* MIDDLE: Document */}
      {!chatExpanded && <main className="flex-1 flex flex-col min-w-0">
        <header className="h-12 px-6 flex items-center justify-between border-b bg-card">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-sm font-semibold truncate">
              {activeProject?.name ?? "Untitled project"}
            </h1>
            <span className="text-xs text-muted-foreground shrink-0">
              {wordCount} {wordCount === 1 ? "word" : "words"}
            </span>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Sign out
          </button>
        </header>

        <div className="flex-1 min-h-0">
          <RichEditor
            ref={editorRef}
            key={activeProject?.id ?? "none"}
            content={activeProject?.content ?? ""}
            format={activeProject?.format ?? "none"}
            onChange={(html, text) =>
              updateActiveProject({ content: html, text })
            }
            onFormatChange={(format) => updateActiveProject({ format })}
          />
        </div>
      </main>}

      {/* RIGHT: Chat (ABY / A Brilliant Mind) */}
      <aside className={chatExpanded ? "flex-1 flex flex-col" : "w-[380px] shrink-0 flex flex-col"} style={{ background: "#FAF5E9", borderLeft: "1px solid #EDE0C4" }}>

        {/* Chat panel header */}
        <header style={{ background: "#F5ECD8", borderBottom: "1px solid #EDE0C4", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {/* Writing coach icon */}
            <div style={{ width: 44, height: 44, borderRadius: "50%", border: "1.5px solid #C8A96E", background: "#FFF8EC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <img src={abyAvatar} alt="ABY" style={{ width: 32, height: 32, objectFit: "contain" }} />
            </div>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#2C2415" }}>Writing coach</div>
              <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "1px" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#5DBE7A", display: "inline-block" }} />
                <span style={{ fontSize: "11px", color: "#7A6A52" }}>Online</span>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              onClick={clearActiveChat}
              style={{ fontSize: "11px", color: "#9A8A72", background: "none", border: "none", cursor: "pointer" }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setChatExpanded((v) => !v)}
              title={chatExpanded ? "Collapse chat" : "Expand chat to full screen"}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "8px", border: "1px solid #D4C4A0", background: "#FFF8EC", cursor: "pointer", color: "#7A6A52" }}
            >
              {chatExpanded
                ? <Minimize2 style={{ width: 14, height: 14 }} />
                : <Maximize2 style={{ width: 14, height: 14 }} />}
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto" style={{ padding: "16px 14px", display: "flex", flexDirection: "column", gap: "12px" }}>
          {(!activeProject || activeProject.messages.length === 0) && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "24px 12px" }}>
              <img src={abyAvatar} alt="ABY" style={{ width: 80, height: 80, objectFit: "contain", marginBottom: "10px" }} />
              <div style={{ fontSize: "14px", fontWeight: 600, color: "#2C2415" }}>Hi! I'm your writing coach 👋</div>
              <div style={{ fontSize: "12px", color: "#9A8A72", marginTop: "8px", lineHeight: 1.6, maxWidth: 240 }}>
                I was trained on scientific writing — ask me anything to get started.
              </div>
            </div>
          )}

          {activeProject?.messages.map((m, i) =>
            m.role === "user" ? (
              /* User bubble — right aligned */
              <div key={i} style={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-end", gap: "8px" }}>
                <div style={{ maxWidth: "80%", background: "#E8C97A", borderRadius: "18px 18px 4px 18px", padding: "10px 14px", fontSize: "17px", fontFamily: "Helvetica, Arial, sans-serif", color: "#2C2415", lineHeight: 1.5, wordBreak: "break-word" }}>
                  {m.content}
                </div>
                {/* User avatar */}
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#2C2415", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                  </svg>
                </div>
              </div>
            ) : (
              /* ABY bubble — left aligned */
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "8px", maxWidth: "88%" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", border: "1.5px solid #C8A96E", background: "#FFF8EC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <img src={abyAvatar} alt="ABY" style={{ width: 22, height: 22, objectFit: "contain" }} />
                </div>
                <div style={{ background: "#FDF6E3", borderRadius: "18px 18px 18px 4px", padding: "10px 14px", fontSize: "17px", fontFamily: "Helvetica, Arial, sans-serif", color: "#2C2415", lineHeight: 1.55 }} className="aby-markdown">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ href, children }) => (
                        <a
                          href={href ?? "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            background: "#FFF3D6",
                            border: "1px solid #C8A96E",
                            borderRadius: "999px",
                            padding: "2px 10px 2px 8px",
                            fontSize: "13px",
                            fontFamily: "Helvetica, Arial, sans-serif",
                            color: "#8B5E10",
                            textDecoration: "none",
                            fontWeight: 500,
                            lineHeight: 1.6,
                            verticalAlign: "middle",
                            whiteSpace: "nowrap",
                            maxWidth: "100%",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          <ExternalLink size={11} strokeWidth={2.2} style={{ flexShrink: 0 }} />
                          {children}
                        </a>
                      ),
                      code: ({ className, children }) => {
                        if (className === "language-insert") {
                          const text = String(children).replace(/\n$/, "");
                          return (
                            <div style={{ margin: "10px 0", border: "1px solid #C8A96E", borderRadius: "12px", background: "#FFFDF5", overflow: "hidden" }}>
                              <div style={{ padding: "10px 14px", fontSize: "15px", lineHeight: 1.6, color: "#2C2415", whiteSpace: "pre-wrap", fontStyle: "italic" }}>
                                {text}
                              </div>
                              <div style={{ borderTop: "1px solid #EDE0C4", padding: "8px 12px", display: "flex", alignItems: "center", gap: "8px", background: "#FAF5E9" }}>
                                <span style={{ fontSize: "12px", color: "#7A6A52", flex: 1 }}>Insert into document?</span>
                                <button
                                  type="button"
                                  onClick={() => insertIntoEditor(text)}
                                  style={{ padding: "4px 14px", borderRadius: "999px", background: "#C87C2A", color: "#fff", border: "none", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                                >
                                  Yes
                                </button>
                                <button
                                  type="button"
                                  style={{ padding: "4px 14px", borderRadius: "999px", background: "none", color: "#9A8A72", border: "1px solid #D4C4A0", fontSize: "12px", cursor: "pointer" }}
                                >
                                  No
                                </button>
                              </div>
                            </div>
                          );
                        }
                        return <code className={className}>{children}</code>;
                      },
                    }}
                  >
                    {m.content}
                  </ReactMarkdown>
                </div>
              </div>
            ),
          )}

          {sending && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", maxWidth: "88%" }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", border: "1.5px solid #C8A96E", background: "#FFF8EC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <img src={abyAvatar} alt="ABY" style={{ width: 22, height: 22, objectFit: "contain" }} />
              </div>
              <div style={{ background: "#F5E6C0", borderRadius: "18px 18px 18px 4px", padding: "10px 14px" }}>
                <span style={{ display: "inline-flex", gap: "4px" }}>
                  <span className="h-1.5 w-1.5 rounded-full animate-bounce [animation-delay:-0.2s]" style={{ background: "#9A8A72" }} />
                  <span className="h-1.5 w-1.5 rounded-full animate-bounce [animation-delay:-0.1s]" style={{ background: "#9A8A72" }} />
                  <span className="h-1.5 w-1.5 rounded-full animate-bounce" style={{ background: "#9A8A72" }} />
                </span>
              </div>
            </div>
          )}

          {error && (
            <div style={{ fontSize: "12px", color: "#c0392b", border: "1px solid #f5c6c6", background: "#fff5f5", borderRadius: "8px", padding: "8px 12px" }}>
              {error}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSend} style={{ padding: "10px 12px", borderTop: "1px solid #EDE0C4", background: "#F5ECD8" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "8px" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(e as unknown as FormEvent);
                  }
                }}
                placeholder={recording ? "Listening…" : "Message your writing coach…"}
                rows={2}
                style={{ width: "100%", resize: "none", borderRadius: "12px", border: recording ? "1.5px solid #C87C2A" : "1px solid #D4C4A0", background: recording ? "#FFF8F0" : "#FFFDF5", padding: "8px 38px 8px 12px", fontSize: "13px", outline: "none", color: "#2C2415", fontFamily: "inherit", boxSizing: "border-box" }}
              />
              <button
                type="button"
                onClick={toggleMic}
                title={recording ? "Stop recording" : "Speak your message"}
                style={{ position: "absolute", right: "8px", bottom: "8px", width: "26px", height: "26px", borderRadius: "50%", border: "none", background: "transparent", color: recording ? "#22c55e" : "#B0A090", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, transition: "color 0.15s" }}
              >
                <Mic size={15} strokeWidth={2} />
              </button>
            </div>
            <button
              type="submit"
              disabled={sending || input.trim().length === 0 || !activeProject}
              style={{ height: "36px", padding: "0 16px", borderRadius: "18px", background: "#C87C2A", color: "#fff", border: "none", fontSize: "13px", fontWeight: 600, cursor: "pointer", opacity: (sending || input.trim().length === 0 || !activeProject) ? 0.5 : 1, transition: "opacity 0.15s" }}
            >
              Send
            </button>
          </div>
        </form>
      </aside>
      </div>{/* end three-column row */}

    </div>
  );
}
