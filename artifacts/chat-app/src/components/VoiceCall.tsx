import { useEffect, useRef, useState, useCallback } from "react";
import type { ChatMessage } from "@/lib/api";
import { Phone, Mic, MicOff, Loader2, X } from "lucide-react";
import abyAvatar from "@/assets/aby.png";

interface Props {
  messages: ChatMessage[];
  audioCtx: AudioContext;
  onNewMessages: (msgs: ChatMessage[]) => void;
  onClose: () => void;
}

type Phase =
  | "ringing"     // beeps playing
  | "greeting"    // Abby intro speech
  | "listening"   // mic live, capturing
  | "confirming"  // heard something — 800ms preview before auto-send
  | "processing"  // waiting for first stream token
  | "speaking"    // streaming + TTS playing
  | "muted";      // user muted the mic

import type { SpeechRecognitionInstance, SpeechRecognitionResultEvent } from "@/lib/speech-types";
import "@/lib/speech-types";

const GREETING =
  "Hi! I'm Abby, your scientific writing coach. How can I help you?";

const CONFIRM_MS = 800;

// ── Audio helpers ─────────────────────────────────────────────────────────────

function playBeeps(ctx: AudioContext): Promise<void> {
  return new Promise((resolve) => {
    const beep = (start: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = 450;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.3, start + 0.03);
      gain.gain.setValueAtTime(0.3, start + 0.38);
      gain.gain.linearRampToValueAtTime(0, start + 0.45);
      osc.start(start);
      osc.stop(start + 0.5);
    };
    const now = ctx.currentTime;
    beep(now);
    beep(now + 0.75);
    setTimeout(resolve, 1600);
  });
}

function stripMarkdown(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/#+\s/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[📝📄📌]/g, "")
    .trim();
}

function speakBrowser(text: string, onDone: () => void): { cancel: () => void } {
  let cancelled = false;
  window.speechSynthesis.cancel();
  const voices = window.speechSynthesis.getVoices();
  const en = voices.filter((v) => v.lang.startsWith("en"));
  const priority = [
    "Google UK English Female", "Google US English",
    "Microsoft Sonia Online", "Microsoft Jenny Online",
    "Samantha", "Karen", "Moira", "Tessa", "Zira",
  ];
  let voice: SpeechSynthesisVoice | null = null;
  for (const name of priority) {
    const m = en.find((v) => v.name.includes(name));
    if (m) { voice = m; break; }
  }
  const utter = new SpeechSynthesisUtterance(stripMarkdown(text));
  utter.rate = 0.9; utter.pitch = 1.0; utter.volume = 1;
  if (voice) utter.voice = voice;
  utter.onend = () => { if (!cancelled) onDone(); };
  utter.onerror = (e: SpeechSynthesisErrorEvent) => {
    if (!cancelled && e.error !== "interrupted") onDone();
  };
  window.speechSynthesis.speak(utter);
  return { cancel: () => { cancelled = true; window.speechSynthesis.cancel(); } };
}

// Resolves once: first tries ElevenLabs, falls back to browser TTS on error
function speakOnce(
  text: string,
  audioCtx: AudioContext,
  onDone: () => void,
): { cancel: () => void } {
  let source: AudioBufferSourceNode | null = null;
  let cancelled = false;
  let fallback: { cancel: () => void } | null = null;

  (async () => {
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text: stripMarkdown(text) }),
      });
      if (cancelled) return;
      if (!res.ok) { fallback = speakBrowser(text, onDone); return; }
      const buf = await audioCtx.decodeAudioData(await res.arrayBuffer());
      if (cancelled) return;
      source = audioCtx.createBufferSource();
      source.buffer = buf;
      source.connect(audioCtx.destination);
      source.onended = () => { if (!cancelled) onDone(); };
      source.start();
    } catch { if (!cancelled) fallback = speakBrowser(text, onDone); }
  })();

  return {
    cancel: () => {
      cancelled = true;
      try { source?.stop(); } catch { /* */ }
      fallback?.cancel();
    },
  };
}

// ── Sentence extraction ───────────────────────────────────────────────────────

function extractSentences(buf: string): { sentences: string[]; remaining: string } {
  const re = /[.!?]+(?:\s+|$)/g;
  const sentences: string[] = [];
  let lastEnd = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(buf)) !== null) {
    const s = buf.slice(lastEnd, match.index + match[0].length).trim();
    if (s.length > 4) sentences.push(s);
    lastEnd = match.index + match[0].length;
  }
  return { sentences, remaining: buf.slice(lastEnd) };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function VoiceCall({ messages, audioCtx, onNewMessages, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>("ringing");
  const [abyText, setAbyText] = useState("");
  const [userText, setUserText] = useState("");
  const [pendingText, setPendingText] = useState("");
  const [callMessages, setCallMessages] = useState<ChatMessage[]>(messages);

  const messagesRef = useRef<ChatMessage[]>(messages);
  const transcriptRef = useRef("");
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Mute/phase tracked in refs so closures always see current value
  const mutedRef = useRef(false);
  const phaseRef = useRef<Phase>("ringing");

  // TTS sentence queue — speaks sentences sequentially
  const ttsQueueRef = useRef<string[]>([]);
  const ttsActiveRef = useRef(false);
  const cancelTtsRef = useRef<(() => void) | null>(null);
  // Flag set when stream is done, so drainQueue knows when to finalise
  const streamDoneRef = useRef(false);
  const onStreamFinishedRef = useRef<(() => void) | null>(null);

  useEffect(() => { messagesRef.current = callMessages; }, [callMessages]);
  useEffect(() => {
    phaseRef.current = phase;
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [phase, callMessages, abyText]);

  // ── TTS queue ──────────────────────────────────────────────────────────────

  function drainQueue() {
    if (ttsQueueRef.current.length === 0) {
      ttsActiveRef.current = false;
      if (streamDoneRef.current) onStreamFinishedRef.current?.();
      return;
    }
    ttsActiveRef.current = true;
    const sentence = ttsQueueRef.current.shift()!;
    const { cancel } = speakOnce(sentence, audioCtx, () => {
      cancelTtsRef.current = null;
      drainQueue();
    });
    cancelTtsRef.current = cancel;
  }

  function enqueueSentence(sentence: string) {
    if (!sentence.trim()) return;
    ttsQueueRef.current.push(sentence);
    if (!ttsActiveRef.current) drainQueue();
  }

  function stopTtsQueue() {
    ttsQueueRef.current = [];
    cancelTtsRef.current?.();
    cancelTtsRef.current = null;
    ttsActiveRef.current = false;
    streamDoneRef.current = false;
    onStreamFinishedRef.current = null;
    window.speechSynthesis.cancel();
  }

  // ── Auto-listen loop ───────────────────────────────────────────────────────
  // Uses continuous mode so the browser doesn't stop on mid-sentence pauses.
  // A 2-second silence timer fires after the last spoken word to stop naturally.

  // eslint-disable-next-line react-hooks/exhaustive-deps
  function autoListen() {
    if (mutedRef.current) return;
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) return;

    transcriptRef.current = "";
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }

    const rec: SpeechRecognitionInstance = new SR();
    rec.lang = "en-US";
    rec.continuous = true;   // keep listening through natural breath pauses
    rec.interimResults = true;

    rec.onstart = () => {
      setPhase("listening"); phaseRef.current = "listening";
      setUserText(""); setPendingText(""); setAbyText("");
    };

    rec.onresult = (e: SpeechRecognitionResultEvent) => {
      // Rebuild full transcript from all accumulated results
      let finalText = "";
      let interimText = "";
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript + " ";
        else interimText += e.results[i][0].transcript;
      }
      const display = (finalText + interimText).trim();
      transcriptRef.current = finalText.trim() || interimText.trim();
      setUserText(display);

      // After each new word, reset the 2-second silence countdown
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        // Silence detected — stop recognition; onend will take it from here
        try { rec.stop(); } catch { /* */ }
      }, 2000);
    };

    rec.onend = () => {
      if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
      const captured = transcriptRef.current.trim();
      transcriptRef.current = "";
      setUserText("");
      if (!captured) {
        if (!mutedRef.current) setTimeout(() => autoListen(), 300);
        return;
      }
      setPendingText(captured);
      setPhase("confirming"); phaseRef.current = "confirming";
      confirmTimerRef.current = setTimeout(() => sendMessage(captured), CONFIRM_MS);
    };

    rec.onerror = () => {
      if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
      if (!mutedRef.current) setTimeout(() => autoListen(), 500);
    };

    recognitionRef.current = rec;
    try { rec.start(); } catch { /* already started */ }
  }

  function cancelPending() {
    if (confirmTimerRef.current) { clearTimeout(confirmTimerRef.current); confirmTimerRef.current = null; }
    setPendingText("");
    if (!mutedRef.current) autoListen();
    else { setPhase("muted"); phaseRef.current = "muted"; }
  }

  function toggleMute() {
    const p = phaseRef.current;
    if (p === "listening") {
      mutedRef.current = true;
      try { recognitionRef.current?.stop(); } catch { /* */ }
      setPhase("muted"); phaseRef.current = "muted";
    } else if (p === "muted") {
      mutedRef.current = false;
      autoListen();
    } else if (p === "confirming") {
      cancelPending();
      mutedRef.current = true;
      setPhase("muted"); phaseRef.current = "muted";
    }
  }

  // ── Streaming send ─────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) {
      if (!mutedRef.current) setTimeout(() => autoListen(), 0);
      return;
    }

    setPhase("processing"); phaseRef.current = "processing";
    setAbyText(""); setUserText(""); setPendingText("");

    // Visible conversation (no voice note prefix)
    const visibleMsgs: ChatMessage[] = [
      ...messagesRef.current,
      { role: "user", content: text },
    ];
    // API messages — strip previous voice notes, add current
    const apiMessages: ChatMessage[] = [
      ...messagesRef.current.map((m) =>
        m.role === "user"
          ? { ...m, content: m.content.replace(/^\[Voice mode\][^\n]*\n\n/, "") }
          : m
      ),
      { role: "user", content: text },
    ];

    // Reset TTS queue
    stopTtsQueue();
    streamDoneRef.current = false;

    let textBuf = "";
    let fullReply = "";
    let firstSentence = true;

    // Called after all TTS finishes
    onStreamFinishedRef.current = () => {
      const finalMsgs: ChatMessage[] = [
        ...visibleMsgs,
        { role: "assistant", content: fullReply || "Could you say that again?" },
      ];
      setCallMessages(finalMsgs);
      onNewMessages(finalMsgs);
      messagesRef.current = finalMsgs;
      if (!mutedRef.current) autoListen();
      else { setPhase("muted"); phaseRef.current = "muted"; }
    };

    function flushBuffer(flush = false) {
      const { sentences, remaining } = extractSentences(textBuf);
      for (const s of sentences) {
        fullReply += (fullReply ? " " : "") + s;
        enqueueSentence(s);
        if (firstSentence) {
          setPhase("speaking"); phaseRef.current = "speaking";
          firstSentence = false;
        }
      }
      textBuf = remaining;
      if (flush && textBuf.trim()) {
        fullReply += (fullReply ? " " : "") + textBuf.trim();
        enqueueSentence(textBuf.trim());
        textBuf = "";
        if (firstSentence) {
          setPhase("speaking"); phaseRef.current = "speaking";
          firstSentence = false;
        }
      }
    }

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!res.ok || !res.body) {
        // Fallback: non-streaming
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        const fallbackText = data.error ? "Could you say that again?" : "Sorry, something went wrong.";
        setAbyText(fallbackText);
        setPhase("speaking"); phaseRef.current = "speaking";
        enqueueSentence(fallbackText);
        streamDoneRef.current = true;
        if (!ttsActiveRef.current) drainQueue();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sseBuf = "";

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuf += decoder.decode(value, { stream: true });
        const lines = sseBuf.split("\n");
        sseBuf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") { flushBuffer(true); continue; }
          try {
            const { t } = JSON.parse(payload) as { t?: string };
            if (t) {
              textBuf += t;
              setAbyText((prev) => prev + t);
              flushBuffer();
            }
          } catch { /* skip */ }
        }
      }
      flushBuffer(true);
    } catch {
      const errText = "Sorry, I had trouble connecting. Try again?";
      setAbyText(errText);
      setPhase("speaking"); phaseRef.current = "speaking";
      enqueueSentence(errText);
    } finally {
      streamDoneRef.current = true;
      if (!ttsActiveRef.current) drainQueue(); // may trigger onStreamFinished
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioCtx, onNewMessages]);

  // ── Wake lock — keep screen on during the call ────────────────────────────

  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null;
    (navigator as unknown as { wakeLock: { request: (t: string) => Promise<{ release: () => Promise<void> }> } })
      .wakeLock.request("screen")
      .then((l) => { lock = l; })
      .catch(() => { /* denied or unsupported — fine */ });
    return () => { lock?.release().catch(() => {}); };
  }, []);

  // ── Mount: beeps → greeting → auto-listen ─────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    window.speechSynthesis.getVoices();

    playBeeps(audioCtx).then(() => {
      if (cancelled) return;
      setPhase("greeting"); phaseRef.current = "greeting";
      setAbyText(GREETING);
      const { cancel } = speakOnce(GREETING, audioCtx, () => {
        if (!cancelled && !mutedRef.current) autoListen();
      });
      cancelTtsRef.current = cancel;
    });

    return () => {
      cancelled = true;
      stopTtsQueue();
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      try { recognitionRef.current?.stop(); } catch { /* */ }
      window.speechSynthesis.cancel();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derived display ────────────────────────────────────────────────────────

  const recentMessages = callMessages
    .filter((m) => !m.content.startsWith("[Voice mode]"))
    .slice(-8);

  const statusLabel: Partial<Record<Phase, string>> = {
    ringing:    "Calling Abby…",
    greeting:   "Abby is speaking…",
    listening:  "Listening…",
    confirming: "Got it — sending…",
    processing: "Abby is thinking…",
    speaking:   "Abby is speaking…",
    muted:      "Mic muted",
  };

  const micIsActive = phase === "listening" || phase === "confirming";
  const micDisabled = phase === "ringing" || phase === "greeting" ||
                      phase === "processing";
  const avatarGlow = phase === "greeting" || phase === "speaking";

  return (
    <div className="fixed inset-0 z-50 bg-[#0a0812] flex flex-col text-white overflow-hidden">

      {/* Top bar */}
      <div className="shrink-0 h-12 px-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-white/50 text-sm">Abby · Scientific Writing Coach</span>
        </div>
        {phase === "processing" && (
          <Loader2 className="h-4 w-4 animate-spin text-white/30" />
        )}
      </div>

      {/* Avatar */}
      <div className="shrink-0 flex flex-col items-center pt-6 pb-3 gap-3">
        <div className="relative">
          {phase === "ringing" && (
            <>
              <span className="absolute inset-[-10px] rounded-full bg-emerald-400/15 animate-ping" style={{ animationDuration: "1.2s" }} />
              <span className="absolute inset-[-22px] rounded-full bg-emerald-400/8 animate-ping" style={{ animationDuration: "1.2s", animationDelay: "0.3s" }} />
            </>
          )}
          {phase === "listening" && (
            <span className="absolute inset-[-8px] rounded-full bg-emerald-400/20 animate-pulse" />
          )}
          {avatarGlow && (
            <span className="absolute inset-[-6px] rounded-full bg-yellow-400/20 animate-pulse" />
          )}
          <img
            src={abyAvatar}
            alt="Abby"
            className={
              "h-28 w-28 rounded-full object-cover object-top shadow-2xl border-4 transition-all duration-500 " +
              (avatarGlow
                ? "border-yellow-400 shadow-yellow-400/30"
                : micIsActive
                ? "border-emerald-400 shadow-emerald-400/20"
                : "border-white/20")
            }
          />
        </div>
        <p className="text-white/40 text-xs tracking-wide">{statusLabel[phase] ?? ""}</p>
      </div>

      {/* Live / streaming / confirm text */}
      <div className="shrink-0 min-h-[80px] px-8 flex flex-col items-center justify-start pt-1 gap-2">
        {/* Abby streaming text */}
        {(phase === "greeting" || phase === "speaking") && abyText && (
          <p className="text-yellow-100 text-sm text-center leading-relaxed max-w-sm">{abyText}</p>
        )}

        {/* User live transcript */}
        {phase === "listening" && userText && (
          <p className="text-white/70 text-sm text-center leading-relaxed max-w-sm italic">{userText}</p>
        )}

        {/* Confirm preview */}
        {phase === "confirming" && pendingText && (
          <div className="flex items-start gap-2 bg-white/10 rounded-2xl px-4 py-2.5 max-w-sm w-full">
            <p className="flex-1 text-white text-sm leading-relaxed">{pendingText}</p>
            <button
              type="button"
              onClick={cancelPending}
              className="shrink-0 mt-0.5 text-white/40 hover:text-white transition"
              title="Cancel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Confirm progress bar */}
        {phase === "confirming" && (
          <div className="w-28 h-0.5 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-400 rounded-full"
              style={{ animation: `linear-fill ${CONFIRM_MS}ms linear forwards` }} />
          </div>
        )}

        {/* Thinking dots (only while waiting for first token) */}
        {phase === "processing" && (
          <div className="flex gap-1.5 items-center mt-1">
            {[0, 0.18, 0.36].map((d) => (
              <span key={d} className="h-1.5 w-1.5 rounded-full bg-white/30 animate-bounce"
                style={{ animationDelay: `${d}s` }} />
            ))}
          </div>
        )}
      </div>

      {/* Message log */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-2 flex flex-col gap-2 min-h-0">
        {recentMessages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={
              "max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-relaxed " +
              (m.role === "user"
                ? "bg-white/10 text-white/80"
                : "bg-yellow-400/10 text-yellow-100 border border-yellow-400/15")
            }>
              {m.role === "assistant" && (
                <span className="block text-[10px] text-yellow-400/50 mb-0.5 font-medium uppercase tracking-wide">Abby</span>
              )}
              {m.content}
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="shrink-0 h-24 flex items-center justify-center gap-8">
        <button type="button" onClick={onClose}
          className="h-12 w-12 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-xl transition"
          title="End call">
          <Phone className="h-5 w-5 text-white rotate-[135deg]" />
        </button>

        <button
          type="button"
          onClick={toggleMute}
          disabled={micDisabled}
          className={
            "h-16 w-16 rounded-full flex items-center justify-center shadow-2xl transition-all duration-200 " +
            (micIsActive
              ? "bg-emerald-500 scale-110 ring-4 ring-emerald-400/40"
              : micDisabled
              ? "bg-white/10 cursor-not-allowed"
              : "bg-white/20 hover:bg-white/30")
          }
          title={micIsActive ? "Mute" : "Unmute"}
        >
          {micIsActive
            ? <Mic className="h-7 w-7 text-white" />
            : <MicOff className={`h-7 w-7 ${micDisabled ? "text-white/20" : "text-white/50"}`} />
          }
        </button>
      </div>

      <style>{`
        @keyframes linear-fill {
          from { width: 0%; }
          to   { width: 100%; }
        }
      `}</style>
    </div>
  );
}
