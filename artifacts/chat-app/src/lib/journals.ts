import type { DocFormat } from "@/components/RichEditor";

export interface JournalMatch {
  format: DocFormat;
  formatLabel: string;
  outlet: string;
}

interface Rule {
  match: RegExp;
  format: DocFormat;
  formatLabel: string;
  outlet: string;
}

const RULES: Rule[] = [
  { match: /\bIEEE\s+(transactions|access|trans\.?)/i, format: "ieee", formatLabel: "IEEE", outlet: "IEEE journal" },
  { match: /\bIEEE\b/i, format: "ieee", formatLabel: "IEEE", outlet: "IEEE" },
  { match: /\bACM\b/i, format: "ieee", formatLabel: "IEEE-style", outlet: "ACM (numeric)" },

  { match: /\bAPA\s*7\b|\bAPA\s*\(?\s*7\s*(th)?\)?/i, format: "apa7", formatLabel: "APA 7", outlet: "APA 7" },
  { match: /\bAPA\s*6\b|\bAPA\s*\(?\s*6\s*(th)?\)?/i, format: "apa6", formatLabel: "APA 6", outlet: "APA 6" },
  { match: /\bAPA\b/i, format: "apa7", formatLabel: "APA 7", outlet: "APA" },
  { match: /\bamerican\s+psychological/i, format: "apa7", formatLabel: "APA 7", outlet: "APA journal" },
  { match: /\bjournal\s+of\s+(personality|applied\s+psychology|abnormal\s+psychology|counseling\s+psychology)/i, format: "apa7", formatLabel: "APA 7", outlet: "APA journal" },
  { match: /\bpsycholog(y|ical)\b/i, format: "apa7", formatLabel: "APA 7", outlet: "psychology journal" },

  { match: /\bMLA\s*9\b/i, format: "mla", formatLabel: "MLA 9", outlet: "MLA 9" },
  { match: /\bMLA\b/i, format: "mla", formatLabel: "MLA", outlet: "MLA" },
  { match: /\bmodern\s+language\b/i, format: "mla", formatLabel: "MLA", outlet: "MLA" },
  { match: /\b(literature|humanities)\s+journal\b/i, format: "mla", formatLabel: "MLA", outlet: "humanities journal" },

  { match: /\bChicago\b|\bturabian\b/i, format: "chicago", formatLabel: "Chicago", outlet: "Chicago" },
  { match: /\bjournal\s+of\s+(american|modern)\s+history\b/i, format: "chicago", formatLabel: "Chicago", outlet: "history journal" },

  { match: /\bharvard\b/i, format: "harvard", formatLabel: "Harvard", outlet: "Harvard" },

  { match: /\b(nature|science|cell|lancet|jama|nejm|new\s+england\s+journal\s+of\s+medicine|bmj|plos|elsevier|springer|wiley)\b/i, format: "apa7", formatLabel: "APA 7 (close to Vancouver)", outlet: "biomedical journal" },
];

export function detectJournal(text: string): JournalMatch | null {
  if (!text) return null;
  for (const rule of RULES) {
    if (rule.match.test(text)) {
      return { format: rule.format, formatLabel: rule.formatLabel, outlet: rule.outlet };
    }
  }
  return null;
}
