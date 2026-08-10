import type { DocFormat } from "@/components/RichEditor";

export interface CitationData {
  type: "journal" | "web" | "book";
  authors: { given?: string; family: string }[];
  year?: string;
  title: string;
  containerTitle?: string;
  publisher?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  url?: string;
  accessed?: string;
}

export interface FormattedCitation {
  inText: string;
  reference: string;
  link: string | null;
}

const DOI_RE = /\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)\b/i;

export function extractDoi(input: string): string | null {
  const m = input.match(DOI_RE);
  return m ? m[1] : null;
}

export function isUrl(input: string): boolean {
  return /^https?:\/\//i.test(input.trim());
}

export async function fetchCitationData(input: string): Promise<CitationData> {
  const trimmed = input.trim();
  const doi = extractDoi(trimmed);

  if (doi) {
    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
    if (!res.ok) throw new Error(`Could not find DOI ${doi}`);
    const json = await res.json();
    const m = json.message ?? {};
    const authors = (m.author ?? []).map((a: { given?: string; family?: string; name?: string }) => ({
      given: a.given,
      family: a.family ?? a.name ?? "",
    }));
    const dateParts: number[] | undefined =
      m.issued?.["date-parts"]?.[0] ??
      m["published-print"]?.["date-parts"]?.[0] ??
      m["published-online"]?.["date-parts"]?.[0];
    const year = dateParts ? String(dateParts[0]) : undefined;
    const title = Array.isArray(m.title) ? m.title[0] : m.title ?? "Untitled";
    const containerTitle = Array.isArray(m["container-title"])
      ? m["container-title"][0]
      : m["container-title"];
    return {
      type: m.type === "book" ? "book" : "journal",
      authors,
      year,
      title,
      containerTitle,
      publisher: m.publisher,
      volume: m.volume,
      issue: m.issue,
      pages: m.page,
      doi,
      url: `https://doi.org/${doi}`,
    };
  }

  if (isUrl(trimmed)) {
    let host = "";
    try {
      host = new URL(trimmed).hostname.replace(/^www\./, "");
    } catch {
      host = trimmed;
    }
    const today = new Date();
    const accessed = `${today.toLocaleString("en-US", { month: "long" })} ${today.getDate()}, ${today.getFullYear()}`;
    return {
      type: "web",
      authors: [{ family: host }],
      year: String(today.getFullYear()),
      title: trimmed,
      containerTitle: host,
      url: trimmed,
      accessed,
    };
  }

  throw new Error("Paste a DOI (e.g. 10.1038/s41586-020-2649-2) or a URL (https://…)");
}

function authorListAPA(authors: CitationData["authors"]): string {
  if (authors.length === 0) return "";
  const parts = authors.map((a) => {
    const initials = a.given
      ? a.given
          .split(/\s+/)
          .map((s) => s[0])
          .filter(Boolean)
          .map((c) => `${c}.`)
          .join(" ")
      : "";
    return initials ? `${a.family}, ${initials}` : a.family;
  });
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]}, & ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, & ${parts[parts.length - 1]}`;
}

function authorListChicago(authors: CitationData["authors"]): string {
  if (authors.length === 0) return "";
  const fmt = (a: CitationData["authors"][number], first: boolean) =>
    first
      ? `${a.family}, ${a.given ?? ""}`.trim().replace(/,$/, "")
      : `${a.given ?? ""} ${a.family}`.trim();
  if (authors.length === 1) return fmt(authors[0], true);
  if (authors.length === 2) return `${fmt(authors[0], true)}, and ${fmt(authors[1], false)}`;
  if (authors.length === 3)
    return `${fmt(authors[0], true)}, ${fmt(authors[1], false)}, and ${fmt(authors[2], false)}`;
  return `${fmt(authors[0], true)} et al.`;
}

function authorListMLA(authors: CitationData["authors"]): string {
  if (authors.length === 0) return "";
  const first = authors[0];
  const firstStr = `${first.family}, ${first.given ?? ""}`.trim().replace(/,$/, "");
  if (authors.length === 1) return firstStr;
  if (authors.length === 2) {
    const a2 = authors[1];
    return `${firstStr}, and ${a2.given ?? ""} ${a2.family}`.trim();
  }
  return `${firstStr}, et al.`;
}

function inTextAPA(c: CitationData): string {
  if (c.authors.length === 0) return c.year ? `(${c.year})` : "";
  const last = c.authors[0].family;
  if (c.authors.length === 1) return `(${last}, ${c.year ?? "n.d."})`;
  if (c.authors.length === 2)
    return `(${c.authors[0].family} & ${c.authors[1].family}, ${c.year ?? "n.d."})`;
  return `(${last} et al., ${c.year ?? "n.d."})`;
}

function inTextMLA(c: CitationData): string {
  if (c.authors.length === 0) return "";
  if (c.authors.length === 1) return `(${c.authors[0].family})`;
  if (c.authors.length === 2)
    return `(${c.authors[0].family} and ${c.authors[1].family})`;
  return `(${c.authors[0].family} et al.)`;
}

function inTextChicago(c: CitationData): string {
  if (c.authors.length === 0) return c.year ? `(${c.year})` : "";
  const last = c.authors[0].family;
  if (c.authors.length === 1) return `(${last} ${c.year ?? "n.d."})`;
  if (c.authors.length === 2)
    return `(${c.authors[0].family} and ${c.authors[1].family} ${c.year ?? "n.d."})`;
  return `(${last} et al. ${c.year ?? "n.d."})`;
}

export function formatCitation(c: CitationData, fmt: DocFormat): FormattedCitation {
  const link = c.url ?? (c.doi ? `https://doi.org/${c.doi}` : null);
  const year = c.year ?? "n.d.";

  switch (fmt) {
    case "apa7":
    case "apa6": {
      const authors = authorListAPA(c.authors);
      const parts: string[] = [];
      if (authors) parts.push(`${authors} (${year}).`);
      else parts.push(`(${year}).`);
      parts.push(`${c.title}${c.title.endsWith(".") ? "" : "."}`);
      if (c.containerTitle) {
        const vol = c.volume ? ` ${c.volume}` : "";
        const iss = c.issue ? `(${c.issue})` : "";
        const pages = c.pages ? `, ${c.pages}` : "";
        parts.push(`${c.containerTitle}${vol}${iss}${pages}.`);
      } else if (c.publisher) {
        parts.push(`${c.publisher}.`);
      }
      if (link) parts.push(link);
      return { inText: inTextAPA(c), reference: parts.join(" ").trim(), link };
    }

    case "mla": {
      const authors = authorListMLA(c.authors);
      const parts: string[] = [];
      if (authors) parts.push(`${authors}.`);
      parts.push(`"${c.title}."`);
      if (c.containerTitle) {
        const vol = c.volume ? `, vol. ${c.volume}` : "";
        const iss = c.issue ? `, no. ${c.issue}` : "";
        const yr = `, ${year}`;
        const pg = c.pages ? `, pp. ${c.pages}` : "";
        parts.push(`${c.containerTitle}${vol}${iss}${yr}${pg}.`);
      } else if (c.publisher) {
        parts.push(`${c.publisher}, ${year}.`);
      } else {
        parts.push(`${year}.`);
      }
      if (link) parts.push(link);
      if (c.accessed) parts.push(`Accessed ${c.accessed}.`);
      return { inText: inTextMLA(c), reference: parts.join(" ").trim(), link };
    }

    case "chicago": {
      const authors = authorListChicago(c.authors);
      const parts: string[] = [];
      if (authors) parts.push(`${authors}.`);
      parts.push(`"${c.title}."`);
      if (c.containerTitle) {
        const vol = c.volume ? ` ${c.volume}` : "";
        const iss = c.issue ? `, no. ${c.issue}` : "";
        const pg = c.pages ? `: ${c.pages}` : "";
        parts.push(`${c.containerTitle}${vol}${iss} (${year})${pg}.`);
      } else if (c.publisher) {
        parts.push(`${c.publisher}, ${year}.`);
      } else {
        parts.push(`${year}.`);
      }
      if (link) parts.push(link);
      return { inText: inTextChicago(c), reference: parts.join(" ").trim(), link };
    }

    case "harvard": {
      const authors = authorListAPA(c.authors);
      const parts: string[] = [];
      if (authors) parts.push(`${authors} (${year})`);
      parts.push(`'${c.title}',`);
      if (c.containerTitle) {
        const vol = c.volume ? `, ${c.volume}` : "";
        const iss = c.issue ? `(${c.issue})` : "";
        const pg = c.pages ? `, pp. ${c.pages}` : "";
        parts.push(`${c.containerTitle}${vol}${iss}${pg}.`);
      } else if (c.publisher) {
        parts.push(`${c.publisher}.`);
      }
      if (link) parts.push(`Available at: ${link}`);
      const inText =
        c.authors.length > 0
          ? c.authors.length > 2
            ? `(${c.authors[0].family} et al., ${year})`
            : `(${c.authors.map((a) => a.family).join(" and ")}, ${year})`
          : `(${year})`;
      return { inText, reference: parts.join(" ").trim(), link };
    }

    case "ieee": {
      const authors = c.authors
        .map((a) => {
          const initials = a.given
            ? a.given
                .split(/\s+/)
                .map((s) => s[0])
                .filter(Boolean)
                .map((c) => `${c}.`)
                .join(" ")
            : "";
          return initials ? `${initials} ${a.family}` : a.family;
        })
        .join(", ");
      const parts: string[] = [];
      if (authors) parts.push(`${authors},`);
      parts.push(`"${c.title},"`);
      if (c.containerTitle) {
        const vol = c.volume ? `, vol. ${c.volume}` : "";
        const iss = c.issue ? `, no. ${c.issue}` : "";
        const pg = c.pages ? `, pp. ${c.pages}` : "";
        parts.push(`${c.containerTitle}${vol}${iss}${pg}, ${year}.`);
      } else if (c.publisher) {
        parts.push(`${c.publisher}, ${year}.`);
      } else {
        parts.push(`${year}.`);
      }
      if (link) parts.push(`[Online]. Available: ${link}`);
      return { inText: "[1]", reference: parts.join(" ").trim(), link };
    }

    case "none":
    default: {
      const authors = authorListAPA(c.authors);
      const ref = `${authors ? authors + ". " : ""}${c.title}. ${c.containerTitle ?? c.publisher ?? ""} ${year}. ${link ?? ""}`.trim();
      return { inText: c.authors[0]?.family ? `(${c.authors[0].family}, ${year})` : `(${year})`, reference: ref, link };
    }
  }
}
