"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

type Box = { left: number; top: number };

/** FLIP positions only: layout is measured once per content change, never every frame. */
export function useLayoutMotion(root: RefObject<HTMLElement | null>, revision: string) {
  const previous = useRef(new Map<string, Box>());
  const active = useRef(new Map<HTMLElement, Animation>());
  useLayoutEffect(() => {
    const nodes = root.current?.querySelectorAll<HTMLElement>("[data-layout-key]");
    if (!nodes) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<string, Box>();
    nodes.forEach((node) => {
      const key = node.dataset.layoutKey!;
      const old = previous.current.get(key);
      const running = active.current.get(node);
      // Carry a running animation's presentation offset into the next layout change.
      const matrix = new DOMMatrixReadOnly(running ? getComputedStyle(node).transform : undefined);
      running?.cancel();
      const rect = node.getBoundingClientRect();
      // Nested notes inherit their panel's movement. Animate only their local reflow.
      const parent = node.parentElement?.closest<HTMLElement>("[data-layout-key]")?.getBoundingClientRect();
      const left = rect.left - (parent?.left ?? 0);
      const top = rect.top - (parent?.top ?? 0);
      next.set(key, { left, top });
      if (reduced || !old) return;
      const x = old.left + matrix.m41 - left;
      const y = old.top + matrix.m42 - top;
      if (Math.abs(x) + Math.abs(y) < 1) return;
      const animation = node.animate([
        { transform: `translate(${x}px, ${y}px)` },
        { transform: "translate(0, 0)" },
      ], { duration: 460, easing: "cubic-bezier(.2,.8,.2,1)" });
      active.current.set(node, animation);
      animation.onfinish = () => active.current.delete(node);
    });
    for (const [node, animation] of active.current) {
      if (!node.isConnected) { animation.cancel(); active.current.delete(node); }
    }
    previous.current = next;
  }, [root, revision]);
  useLayoutEffect(() => {
    const animations = active.current;
    return () => { animations.forEach((animation) => animation.cancel()); animations.clear(); };
  }, []);
}
