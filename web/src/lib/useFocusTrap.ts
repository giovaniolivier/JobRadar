import { useEffect, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Piège le focus clavier à l'intérieur d'un élément (modale, panneau) tant que
 * `active` est vrai : met le focus dedans à l'ouverture, cycle avec Tab/Shift+Tab,
 * et rend le focus à l'élément déclencheur à la fermeture.
 *
 * Le gestionnaire est attaché au nœud lui-même (pas au document), donc une modale
 * imbriquée rendue via portail (ex. confirmation) n'entre pas en conflit.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const node: HTMLElement | null = ref.current;
    if (!node) return;
    const trap = node;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(trap.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
      );

    if (!trap.contains(document.activeElement)) {
      (focusables()[0] ?? trap).focus();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        trap.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const current = document.activeElement;
      if (e.shiftKey) {
        if (current === first || !trap.contains(current)) {
          e.preventDefault();
          last.focus();
        }
      } else if (current === last) {
        e.preventDefault();
        first.focus();
      }
    }

    trap.addEventListener("keydown", onKeyDown);
    return () => {
      trap.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [ref, active]);
}
