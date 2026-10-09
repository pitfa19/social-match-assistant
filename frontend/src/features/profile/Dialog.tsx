"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { CloseIcon } from "../../components/Icons";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

type Props = {
  title: string;
  titleId: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  /** When set, the dialog does not render its own header close button. */
  hideClose?: boolean;
  /** Full-screen presentation: custom classes replace the default sheet chrome. */
  immersive?: { backdrop: string; sheet: string; title: string; close: string; body: string; testId?: string };
};

/** Accessible modal: focus trap, Escape, scroll lock, focus restore. */
export function Dialog({ title, titleId, onClose, children, wide, hideClose, immersive }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const first = node?.querySelector<HTMLElement>("[data-autofocus]") ?? node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key !== "Tab" || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const a = items[0];
      const z = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === a || !node.contains(active))) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && (active === z || !node.contains(active))) {
        e.preventDefault();
        a.focus();
      }
    }
    // Escape runs in the bubble phase so inner panels can handle it first
    // (they call preventDefault). Tab trapping stays in the capture phase.
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.stopPropagation();
        closeRef.current();
      }
    }
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("keydown", onEscape);
      document.body.style.overflow = prevOverflow;
      previous?.focus?.();
    };
  }, []);

  if (immersive) {
    return (
      <div className={immersive.backdrop} data-testid={immersive.testId}>
        <div ref={ref} className={immersive.sheet} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
          <h2 id={titleId} className={immersive.title}>
            {title}
          </h2>
          {!hideClose && (
            <button type="button" className={immersive.close} onClick={onClose} aria-label="Zatvori">
              <CloseIcon />
            </button>
          )}
          <div className={immersive.body}>{children}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="dlg-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        className={`dlg-sheet${wide ? " dlg-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="dlg-head">
          <h2 id={titleId} className="dlg-title">
            {title}
          </h2>
          {!hideClose && (
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Zatvori">
              <CloseIcon />
            </button>
          )}
        </header>
        <div className="dlg-body">{children}</div>
      </div>
    </div>
  );
}
