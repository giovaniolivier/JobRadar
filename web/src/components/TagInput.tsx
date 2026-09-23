import { useState, type KeyboardEvent } from "react";
import { normalizeSkillLabel } from "../lib/skills";

type TagInputProps = {
  label: string;
  hint?: string;
  tags: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  normalize?: boolean;
  /** Si retourne true, le tag n’est pas ajouté (ex. Remote → type de poste). */
  onIntercept?: (value: string) => boolean;
};

function labelOf(raw: string, normalize: boolean) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return normalize ? normalizeSkillLabel(trimmed) : trimmed;
}

export function TagInput({
  label,
  hint,
  tags,
  onChange,
  placeholder,
  normalize = true,
  onIntercept,
}: TagInputProps) {
  const [draft, setDraft] = useState("");

  function commitParts(raw: string) {
    const chunks = raw
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!chunks.length) {
      setDraft("");
      return;
    }

    let next = [...tags];
    let changed = false;
    for (const chunk of chunks) {
      if (onIntercept?.(chunk)) continue;
      const value = labelOf(chunk, normalize);
      if (!value) continue;
      if (next.some((t) => t.toLowerCase() === value.toLowerCase())) continue;
      next.push(value);
      changed = true;
    }
    if (changed) onChange(next);
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // Lire la valeur DOM (pas le state React) pour éviter une troncature
    // quand Entrée / virgule arrive juste après la dernière lettre.
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitParts(e.currentTarget.value);
    } else if (e.key === "Backspace" && !e.currentTarget.value && tags.length) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="label">{label}</span>
        {hint && <span className="text-xs text-[var(--ink-soft)]">{hint}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5 border border-[var(--hairline)] bg-[var(--field-bg)] p-2 focus-within:border-[var(--ink)]">
        {tags.map((tag) => (
          <button
            key={tag}
            type="button"
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap border border-[var(--ink)] bg-[var(--ink)] px-2 py-0.5 text-sm text-[var(--btn-fg)]"
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            title={`Retirer ${tag}`}
          >
            <span>{tag}</span>
            <span aria-hidden className="opacity-70">
              ×
            </span>
          </button>
        ))}
        <input
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={(e) => commitParts(e.currentTarget.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (/[,;\n]/.test(text)) {
              e.preventDefault();
              commitParts(text);
            }
          }}
          placeholder={tags.length ? placeholder ?? "Ajouter…" : placeholder ?? "Tapez puis Entrée"}
          aria-label={label}
        />
      </div>
    </div>
  );
}
