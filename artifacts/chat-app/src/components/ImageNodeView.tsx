import { useCallback, useRef, useState } from "react";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import Image from "@tiptap/extension-image";
import { MoveHorizontal, AlignLeft, AlignRight, RectangleHorizontal } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type WrapMode = "block" | "floatLeft" | "floatRight" | "inline";

const WRAP_OPTIONS: { mode: WrapMode; label: string; Icon: React.FC<{ size?: number }> }[] = [
  { mode: "inline",     label: "Inline",      Icon: MoveHorizontal },
  { mode: "floatLeft",  label: "Wrap Left",   Icon: AlignLeft },
  { mode: "floatRight", label: "Wrap Right",  Icon: AlignRight },
  { mode: "block",      label: "Block",       Icon: RectangleHorizontal },
];

type ResizeSide = "left" | "right";

interface HandleDef {
  posTop?: number | "mid"; posBottom?: number;
  posLeft?: number;  posRight?: number;
  cursor: string;
  side: ResizeSide;
  isBar?: boolean;
}

const HANDLES: HandleDef[] = [
  { posTop: -5,   posLeft: -5,  cursor: "nw-resize", side: "left"  },
  { posTop: -5,   posRight: -5, cursor: "ne-resize", side: "right" },
  { posBottom: -5, posLeft: -5,  cursor: "sw-resize", side: "left"  },
  { posBottom: -5, posRight: -5, cursor: "se-resize", side: "right" },
  { posTop: "mid", posLeft: -5,  cursor: "ew-resize", side: "left",  isBar: true },
  { posTop: "mid", posRight: -5, cursor: "ew-resize", side: "right", isBar: true },
];

// ── React NodeView ─────────────────────────────────────────────────────────────

export function ImageNodeView({ node, updateAttributes, selected }: NodeViewProps) {
  const { src, alt, widthPx, wrapMode = "block" } = node.attrs as {
    src: string; alt?: string; widthPx?: number | null; wrapMode?: WrapMode;
  };

  const containerRef = useRef<HTMLDivElement>(null);
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  const displayWidth = liveWidth ?? widthPx ?? null;

  const startResize = useCallback((e: React.PointerEvent, side: ResizeSide) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const baseW = containerRef.current?.offsetWidth ?? 200;

    const onMove = (me: PointerEvent) => {
      const delta = side === "right" ? me.clientX - startX : startX - me.clientX;
      setLiveWidth(Math.max(60, Math.min(baseW + delta, 820)));
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      setLiveWidth((w) => {
        if (w !== null) updateAttributes({ widthPx: Math.round(w) });
        return null;
      });
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }, [updateAttributes]);

  const isFloat = wrapMode === "floatLeft" || wrapMode === "floatRight";
  const wrapperAs: "span" | "div" = isFloat || wrapMode === "inline" ? "span" : "div";

  const wrapStyle: React.CSSProperties = {
    position: "relative",
    userSelect: "none",
    maxWidth: "100%",
    ...(wrapMode === "floatLeft"  ? { float: "left",  display: "inline", marginRight: "1em", marginBottom: "0.5em" } : {}),
    ...(wrapMode === "floatRight" ? { float: "right", display: "inline", marginLeft:  "1em", marginBottom: "0.5em" } : {}),
    ...(wrapMode === "inline"     ? { display: "inline-block", verticalAlign: "middle" } : {}),
    ...(wrapMode === "block"      ? { display: "block", marginTop: "0.75em", marginBottom: "0.75em" } : {}),
  };

  const imgBoxWidth =
    displayWidth != null ? `${displayWidth}px` :
    wrapMode === "block" ? "100%" : "auto";

  return (
    <NodeViewWrapper as={wrapperAs} contentEditable={false} data-drag-handle style={wrapStyle}>

      {/* ── Wrap mode toolbar ── */}
      {selected && (
        <div
          contentEditable={false}
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            gap: 2,
            background: "#18181b",
            border: "1px solid #3f3f46",
            borderRadius: 9,
            padding: "4px 6px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.55)",
            whiteSpace: "nowrap",
          }}
        >
          {WRAP_OPTIONS.map(({ mode, label, Icon }) => (
            <button
              key={mode}
              type="button"
              title={label}
              onClick={() => updateAttributes({ wrapMode: mode })}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "3px 9px",
                background: wrapMode === mode ? "#4f46e5" : "transparent",
                border: "none", borderRadius: 6,
                color: wrapMode === mode ? "#fff" : "#a1a1aa",
                cursor: "pointer", fontSize: 11, fontWeight: 500,
              }}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}

          {displayWidth != null && (
            <>
              <div style={{ width: 1, background: "#3f3f46", height: 16, margin: "0 4px" }} />
              <span style={{ color: "#71717a", fontSize: 11, padding: "0 4px" }}>
                {Math.round(displayWidth)}px
              </span>
              <button
                type="button"
                title="Reset to natural size"
                onClick={() => updateAttributes({ widthPx: null })}
                style={{
                  background: "transparent", border: "none", color: "#71717a",
                  cursor: "pointer", fontSize: 10, padding: "2px 4px", borderRadius: 4,
                }}
              >
                ✕ reset
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Image + handles ── */}
      <div
        ref={containerRef}
        style={{
          position: "relative",
          display: "inline-block",
          width: imgBoxWidth,
          outline: selected ? "2px solid #4f46e5" : "2px solid transparent",
          outlineOffset: 2,
          borderRadius: 3,
          transition: "outline-color 0.1s",
          overflow: "visible",
        }}
      >
        <img
          src={src}
          alt={alt ?? ""}
          draggable={false}
          style={{ display: "block", width: "100%", height: "auto", borderRadius: 2 }}
        />

        {selected && HANDLES.map((h, i) => (
          <div
            key={i}
            onPointerDown={(e) => startResize(e, h.side)}
            style={{
              position: "absolute",
              top:    h.posTop === "mid" ? "50%" : h.posTop,
              bottom: h.posBottom,
              left:   h.posLeft,
              right:  h.posRight,
              transform: h.posTop === "mid" ? "translateY(-50%)" : undefined,
              width:  h.isBar ? 8 : 10,
              height: h.isBar ? 26 : 10,
              background: "#fff",
              border: "2px solid #4f46e5",
              borderRadius: h.isBar ? 4 : 2,
              cursor: h.cursor,
              zIndex: 20,
            }}
          />
        ))}
      </div>
    </NodeViewWrapper>
  );
}

// ── Extension ─────────────────────────────────────────────────────────────────

export const ResizableImage = Image.extend({
  name: "resizable-image",

  addAttributes() {
    return {
      src:   { default: null },
      alt:   { default: null },
      title: { default: null },
      widthPx: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const v = el.getAttribute("data-w");
          return v ? parseInt(v, 10) : null;
        },
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.widthPx != null ? { "data-w": String(attrs.widthPx) } : {},
      },
      wrapMode: {
        default: "block" as WrapMode,
        parseHTML: (el: HTMLElement) => (el.getAttribute("data-wrap") ?? "block") as WrapMode,
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-wrap": (attrs.wrapMode as string) ?? "block",
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "img[src]" }];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    const { widthPx, wrapMode, ...rest } = HTMLAttributes;
    const styles: string[] = [];
    if (widthPx)                   styles.push(`width:${widthPx}px`);
    if (wrapMode === "floatLeft")  styles.push("float:left;margin-right:1em;margin-bottom:0.5em");
    if (wrapMode === "floatRight") styles.push("float:right;margin-left:1em;margin-bottom:0.5em");
    if (wrapMode === "block")      styles.push("display:block;margin:0.75em auto");
    return [
      "img",
      {
        ...rest,
        ...(widthPx != null ? { "data-w": String(widthPx) } : {}),
        "data-wrap": wrapMode ?? "block",
        ...(styles.length ? { style: styles.join(";") } : {}),
      },
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
});
