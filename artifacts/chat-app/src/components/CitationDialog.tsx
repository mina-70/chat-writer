import { useEffect, useState } from "react";
import { fetchCitationData, formatCitation, type FormattedCitation } from "@/lib/citation";
import type { DocFormat } from "@/components/RichEditor";

interface Props {
  open: boolean;
  format: DocFormat;
  onClose: () => void;
  onInsert: (result: { inText: string; reference: string; link: string | null }) => void;
}

export default function CitationDialog({ open, format, onClose, onInsert }: Props) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<FormattedCitation | null>(null);

  useEffect(() => {
    if (!open) {
      setInput("");
      setError(null);
      setPreview(null);
      setLoading(false);
    }
  }, [open]);

  if (!open) return null;

  async function handleLookup() {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const data = await fetchCitationData(input);
      const result = formatCitation(data, format);
      setPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  function handleInsert() {
    if (!preview) return;
    onInsert(preview);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-card border rounded-lg shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Insert citation</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Paste a DOI or URL to fetch the source.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex gap-2">
            <input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleLookup();
              }}
              placeholder="10.1038/s41586-020-2649-2  or  https://example.com/paper"
              className="flex-1 h-9 px-3 rounded-md border bg-background text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="button"
              onClick={handleLookup}
              disabled={loading || !input.trim()}
              className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:opacity-90"
            >
              {loading ? "Looking…" : "Look up"}
            </button>
          </div>

          {error && (
            <div className="text-sm text-destructive border border-destructive/30 bg-destructive/5 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          {preview && (
            <div className="space-y-3">
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  In-text
                </div>
                <div className="text-sm bg-secondary rounded-md px-3 py-2 font-serif">
                  {preview.inText}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  Reference
                </div>
                <div className="text-sm bg-secondary rounded-md px-3 py-2 font-serif leading-relaxed">
                  {preview.reference}
                </div>
              </div>
              {preview.link && (
                <a
                  href={preview.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary underline break-all"
                >
                  {preview.link}
                </a>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-3 rounded-md border bg-background text-sm hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleInsert}
            disabled={!preview}
            className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:opacity-90"
          >
            Insert citation
          </button>
        </div>
      </div>
    </div>
  );
}
