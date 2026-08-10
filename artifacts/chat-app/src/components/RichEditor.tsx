import { useCallback, useEffect, useImperativeHandle, forwardRef, useRef, useState, type ForwardedRef } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import CitationDialog from "@/components/CitationDialog";
import { Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { ResizableImage } from "@/components/ImageNodeView";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import Highlight from "@tiptap/extension-highlight";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  Quote,
  Heading1,
  Heading2,
  Heading3,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Link as LinkIcon,
  Image as ImageIcon,
  Undo2,
  Redo2,
  Eraser,
  Highlighter,
  Minus,
  BookMarked,
} from "lucide-react";

const FontSize = Extension.create({
  name: "fontSize",
  addOptions() {
    return { types: ["textStyle"] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null as string | null,
            parseHTML: (element: HTMLElement) =>
              element.style.fontSize?.replace(/['"]+/g, "") || null,
            renderHTML: (attributes: { fontSize?: string | null }) => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize:
        (fontSize: string) =>
        ({ chain }: { chain: () => ReturnType<Editor["chain"]> }) =>
          chain().setMark("textStyle", { fontSize }).run(),
      unsetFontSize:
        () =>
        ({ chain }: { chain: () => ReturnType<Editor["chain"]> }) =>
          chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run(),
    } as never;
  },
});

export type DocFormat =
  | "none"
  | "apa7"
  | "apa6"
  | "chicago"
  | "mla"
  | "harvard"
  | "ieee";

export interface RichEditorHandle {
  insertAtCursor: (text: string) => void;
}

interface Props {
  content: string;
  onChange: (html: string, text: string) => void;
  format?: DocFormat;
  onFormatChange?: (format: DocFormat) => void;
}

const FONT_FAMILIES = [
  { label: "Default", value: "" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Book Antiqua", value: "'Book Antiqua', Palatino, serif" },
  { label: "Calibri", value: "Calibri, 'Segoe UI', sans-serif" },
  { label: "Cambria", value: "Cambria, Georgia, serif" },
  { label: "Comic Sans MS", value: "'Comic Sans MS', cursive" },
  { label: "Consolas", value: "Consolas, Menlo, monospace" },
  { label: "Courier New", value: "'Courier New', Courier, monospace" },
  { label: "Garamond", value: "Garamond, serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
  { label: "Impact", value: "Impact, Charcoal, sans-serif" },
  { label: "Inter", value: "Inter, system-ui, sans-serif" },
  { label: "Lato", value: "Lato, sans-serif" },
  { label: "Lucida Sans", value: "'Lucida Sans Unicode', 'Lucida Grande', sans-serif" },
  { label: "Merriweather", value: "Merriweather, serif" },
  { label: "Monaco", value: "Monaco, Menlo, monospace" },
  { label: "Open Sans", value: "'Open Sans', sans-serif" },
  { label: "Palatino", value: "'Palatino Linotype', Palatino, serif" },
  { label: "Roboto", value: "Roboto, sans-serif" },
  { label: "Segoe UI", value: "'Segoe UI', Tahoma, sans-serif" },
  { label: "Tahoma", value: "Tahoma, Geneva, sans-serif" },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', Helvetica, sans-serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
];

interface FormatPreset {
  label: string;
  hint: string;
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  textAlign: "left" | "justify";
  firstLineIndent: string;
}

export const DOC_FORMATS: Record<DocFormat, FormatPreset | null> = {
  none: null,
  apa7: {
    label: "APA 7",
    hint: "Times New Roman • 12pt • double-spaced",
    fontFamily: "'Times New Roman', Times, serif",
    fontSize: "12pt",
    lineHeight: "2",
    textAlign: "left",
    firstLineIndent: "0.5in",
  },
  apa6: {
    label: "APA 6",
    hint: "Times New Roman • 12pt • double-spaced",
    fontFamily: "'Times New Roman', Times, serif",
    fontSize: "12pt",
    lineHeight: "2",
    textAlign: "left",
    firstLineIndent: "0.5in",
  },
  chicago: {
    label: "Chicago",
    hint: "Times New Roman • 12pt • double-spaced",
    fontFamily: "'Times New Roman', Times, serif",
    fontSize: "12pt",
    lineHeight: "2",
    textAlign: "left",
    firstLineIndent: "0.5in",
  },
  mla: {
    label: "MLA 9",
    hint: "Times New Roman • 12pt • double-spaced",
    fontFamily: "'Times New Roman', Times, serif",
    fontSize: "12pt",
    lineHeight: "2",
    textAlign: "left",
    firstLineIndent: "0.5in",
  },
  harvard: {
    label: "Harvard",
    hint: "Arial • 12pt • 1.5 line spacing",
    fontFamily: "Arial, Helvetica, sans-serif",
    fontSize: "12pt",
    lineHeight: "1.5",
    textAlign: "justify",
    firstLineIndent: "0.5in",
  },
  ieee: {
    label: "IEEE",
    hint: "Times New Roman • 10pt • single-spaced • justified",
    fontFamily: "'Times New Roman', Times, serif",
    fontSize: "10pt",
    lineHeight: "1.15",
    textAlign: "justify",
    firstLineIndent: "0.25in",
  },
};

const FONT_SIZES = [
  { label: "10", value: "10px" },
  { label: "12", value: "12px" },
  { label: "14", value: "14px" },
  { label: "16", value: "16px" },
  { label: "18", value: "18px" },
  { label: "20", value: "20px" },
  { label: "24", value: "24px" },
  { label: "32", value: "32px" },
  { label: "40", value: "40px" },
  { label: "48", value: "48px" },
];

const RichEditor = forwardRef(function RichEditor({
  content,
  onChange,
  format = "none",
  onFormatChange,
}: Props, ref: ForwardedRef<RichEditorHandle>) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [citeOpen, setCiteOpen] = useState(false);
  const preset = DOC_FORMATS[format];

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true },
      }),
      ResizableImage.configure({ inline: true, allowBase64: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
      FontFamily.configure({ types: ["textStyle"] }),
      FontSize,
      Highlight.configure({ multicolor: true }),
    ],
    content: content || "",
    editorProps: {
      attributes: {
        class:
          "prose prose-sm md:prose-base max-w-none focus:outline-none min-h-[900px] font-serif",
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML(), editor.getText());
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (content !== current) {
      editor.commands.setContent(content || "", { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, editor]);

  const insertImageFromFile = useCallback(
    (file: File) => {
      if (!editor) return;
      const reader = new FileReader();
      reader.onload = () => {
        const src = reader.result as string;
        editor.chain().focus().setImage({ src }).run();
      };
      reader.readAsDataURL(file);
    },
    [editor],
  );

  const insertLink = useCallback(() => {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", previous ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  useImperativeHandle(ref, () => ({
    insertAtCursor: (text: string) => {
      if (!editor) return;
      const end = editor.state.doc.content.size;
      editor.chain().focus().insertContentAt(end, `<p>${text.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`).run();
    },
  }));

  if (!editor) return null;

  return (
    <div className="flex flex-col h-full">
      <Toolbar
        editor={editor}
        onPickImage={() => fileInputRef.current?.click()}
        onInsertLink={insertLink}
        onInsertCitation={() => setCiteOpen(true)}
        format={format}
        onFormatChange={onFormatChange}
      />
      <CitationDialog
        open={citeOpen}
        format={format}
        onClose={() => setCiteOpen(false)}
        onInsert={({ inText, reference, link }) => {
          const inTextHtml = link
            ? ` <a href="${escapeAttr(link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(inText)}</a> `
            : ` ${escapeHtml(inText)} `;
          editor.chain().focus().insertContent(inTextHtml).run();

          const refHtml = link
            ? `<p><a href="${escapeAttr(link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(reference)}</a></p>`
            : `<p>${escapeHtml(reference)}</p>`;
          const end = editor.state.doc.content.size;
          editor
            .chain()
            .focus()
            .insertContentAt(end, refHtml)
            .run();
        }}
      />
      <input
        type="file"
        accept="image/*"
        hidden
        ref={fileInputRef}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) insertImageFromFile(file);
          e.target.value = "";
        }}
      />
      <div className="flex-1 overflow-y-auto bg-secondary py-10 px-6">
        <div
          className={
            "mx-auto w-full max-w-[816px] min-h-[1056px] bg-card border rounded-md shadow-sm p-16 " +
            (preset ? "doc-format" : "")
          }
          style={
            preset
              ? ({
                  fontFamily: preset.fontFamily,
                  fontSize: preset.fontSize,
                  lineHeight: preset.lineHeight,
                  textAlign: preset.textAlign,
                  ["--doc-indent" as string]: preset.firstLineIndent,
                } as React.CSSProperties)
              : undefined
          }
        >
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
});

export default RichEditor;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

function Toolbar({
  editor,
  onPickImage,
  onInsertLink,
  onInsertCitation,
  format,
  onFormatChange,
}: {
  editor: Editor;
  onPickImage: () => void;
  onInsertLink: () => void;
  onInsertCitation: () => void;
  format: DocFormat;
  onFormatChange?: (format: DocFormat) => void;
}) {
  const currentFontFamily = (editor.getAttributes("textStyle").fontFamily as string) ?? "";
  const currentFontSize = (editor.getAttributes("textStyle").fontSize as string) ?? "";
  const currentColor = (editor.getAttributes("textStyle").color as string) ?? "#000000";
  const currentHighlight =
    (editor.getAttributes("highlight").color as string) ?? "#fff59d";

  return (
    <div className="border-b bg-card sticky top-0 z-10">
      <div className="flex flex-wrap items-center gap-1 px-3 py-1.5">
        <select
          aria-label="Document format"
          value={format}
          onChange={(e) => {
            const next = e.target.value as DocFormat;
            const presetNext = DOC_FORMATS[next];
            const chain = editor.chain().focus().selectAll();
            if (presetNext) {
              chain
                .setFontFamily(presetNext.fontFamily)
                .setMark("textStyle", { fontSize: presetNext.fontSize })
                .setTextAlign(presetNext.textAlign);
            } else {
              chain.unsetFontFamily().unsetMark("textStyle").unsetTextAlign();
            }
            chain.setTextSelection(editor.state.selection.from).run();
            onFormatChange?.(next);
          }}
          title={
            DOC_FORMATS[format]
              ? `${DOC_FORMATS[format]!.label} — ${DOC_FORMATS[format]!.hint}`
              : "No academic format"
          }
          className="h-7 text-xs rounded border bg-background px-1.5"
        >
          <option value="none">No format</option>
          <option value="apa7">APA 7</option>
          <option value="apa6">APA 6</option>
          <option value="chicago">Chicago</option>
          <option value="mla">MLA 9</option>
          <option value="harvard">Harvard</option>
          <option value="ieee">IEEE</option>
        </select>

        <Divider />

        <ToolBtn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo">
          <Undo2 className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo">
          <Redo2 className="h-4 w-4" />
        </ToolBtn>

        <Divider />

        <select
          aria-label="Font family"
          value={currentFontFamily}
          onChange={(e) => {
            const v = e.target.value;
            if (v) editor.chain().focus().setFontFamily(v).run();
            else editor.chain().focus().unsetFontFamily().run();
          }}
          className="h-7 text-xs rounded border bg-background px-1.5 max-w-[110px]"
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f.label} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>

        <select
          aria-label="Font size"
          value={currentFontSize}
          onChange={(e) => {
            const v = e.target.value;
            if (v) (editor.chain().focus() as unknown as { setFontSize: (s: string) => { run: () => void } }).setFontSize(v).run();
            else (editor.chain().focus() as unknown as { unsetFontSize: () => { run: () => void } }).unsetFontSize().run();
          }}
          className="h-7 text-xs rounded border bg-background px-1.5 w-[60px]"
        >
          <option value="">Size</option>
          {FONT_SIZES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <Divider />

        <select
          aria-label="Block style"
          value={
            editor.isActive("heading", { level: 1 })
              ? "h1"
              : editor.isActive("heading", { level: 2 })
                ? "h2"
                : editor.isActive("heading", { level: 3 })
                  ? "h3"
                  : "p"
          }
          onChange={(e) => {
            const v = e.target.value;
            const c = editor.chain().focus();
            if (v === "p") c.setParagraph().run();
            else if (v === "h1") c.toggleHeading({ level: 1 }).run();
            else if (v === "h2") c.toggleHeading({ level: 2 }).run();
            else if (v === "h3") c.toggleHeading({ level: 3 }).run();
          }}
          className="h-7 text-xs rounded border bg-background px-1.5"
        >
          <option value="p">Paragraph</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>

        <Divider />

        <ToolBtn
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold"
        >
          <Bold className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic"
        >
          <Italic className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Underline"
        >
          <UnderlineIcon className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="Strikethrough"
        >
          <Strikethrough className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
          title="Inline code"
        >
          <Code className="h-4 w-4" />
        </ToolBtn>

        <label
          className="inline-flex items-center justify-center h-7 w-7 rounded hover:bg-muted cursor-pointer relative"
          title="Text color"
        >
          <span className="text-[10px] font-bold leading-none">A</span>
          <span
            className="absolute bottom-1 left-1.5 right-1.5 h-1 rounded"
            style={{ background: currentColor }}
          />
          <input
            type="color"
            value={currentColor}
            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </label>

        <label
          className="inline-flex items-center justify-center h-7 w-7 rounded hover:bg-muted cursor-pointer relative"
          title="Highlight"
        >
          <Highlighter className="h-4 w-4" />
          <span
            className="absolute bottom-1 left-1.5 right-1.5 h-1 rounded"
            style={{ background: currentHighlight }}
          />
          <input
            type="color"
            value={currentHighlight}
            onChange={(e) =>
              editor.chain().focus().setHighlight({ color: e.target.value }).run()
            }
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </label>

        <Divider />

        <ToolBtn
          active={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          title="Heading 1"
        >
          <Heading1 className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Heading 2"
        >
          <Heading2 className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          title="Heading 3"
        >
          <Heading3 className="h-4 w-4" />
        </ToolBtn>

        <Divider />

        <ToolBtn
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet list"
        >
          <List className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Numbered list"
        >
          <ListOrdered className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="Quote"
        >
          <Quote className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive("codeBlock")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          title="Code block"
        >
          <Code className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Horizontal rule"
        >
          <Minus className="h-4 w-4" />
        </ToolBtn>

        <Divider />

        <ToolBtn
          active={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          title="Align left"
        >
          <AlignLeft className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          title="Align center"
        >
          <AlignCenter className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          title="Align right"
        >
          <AlignRight className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive({ textAlign: "justify" })}
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
          title="Justify"
        >
          <AlignJustify className="h-4 w-4" />
        </ToolBtn>

        <Divider />

        <ToolBtn onClick={onInsertLink} active={editor.isActive("link")} title="Insert link">
          <LinkIcon className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn onClick={onPickImage} title="Insert image">
          <ImageIcon className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn onClick={onInsertCitation} title="Insert citation (DOI / URL)">
          <BookMarked className="h-4 w-4" />
        </ToolBtn>

        <Divider />

        <ToolBtn
          onClick={() =>
            editor.chain().focus().unsetAllMarks().clearNodes().run()
          }
          title="Clear formatting"
        >
          <Eraser className="h-4 w-4" />
        </ToolBtn>
      </div>
    </div>
  );
}

function ToolBtn({
  children,
  onClick,
  active,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={
        "inline-flex items-center justify-center h-7 w-7 rounded transition " +
        (disabled
          ? "opacity-40 cursor-not-allowed "
          : "hover:bg-muted cursor-pointer ") +
        (active ? "bg-muted text-foreground" : "text-foreground")
      }
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-border" />;
}
