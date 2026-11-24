"use client";
import { useEffect } from "react";
import { sfx } from "@/lib/sound/app";

const TARGETS = 'button, a[href], [role="button"], [role="switch"], [role="checkbox"], summary, .btn, .press, [data-sound]';

type Kind = "click" | "tick" | "switch" | "tab" | "none";

function targetOf(t: EventTarget | null): HTMLElement | null {
  return t instanceof Element ? (t.closest(TARGETS) as HTMLElement | null) : null;
}
function kindOf(el: HTMLElement): Kind {
  if (el.matches(":disabled") || el.getAttribute("aria-disabled") === "true") return "none";
  const d = el.dataset.sound;
  if (d === "tab") return "tab";
  if (d === "none") return "none";
  const role = el.getAttribute("role");
  if (role === "switch") return "switch";
  if (role === "checkbox") return "tick";
  return "click";
}

/**
 * Plays the keyboard sounds for the whole app by listening at the document, so individual
 * components don't each need wiring. Sheets, calendar drags and task completion call `sfx` directly.
 * Opt a control out with data-sound="none".
 */
export function AppSounds() {
  useEffect(() => {
    sfx.hydrate();
    let pressed: HTMLElement | null = null;

    const down = (e: PointerEvent) => {
      const el = targetOf(e.target);
      pressed = null;
      if (!el) return;
      const k = kindOf(el);
      if (k === "click") {
        pressed = el;
        sfx.play("click", "down");
      } else if (k === "tab") sfx.play("tab", "select");
    };
    const up = (e: PointerEvent) => {
      const el = pressed;
      pressed = null;
      if (el && e.target instanceof Node && el.contains(e.target)) sfx.play("click", "up");
    };
    const click = (e: MouseEvent) => {
      const el = targetOf(e.target);
      if (!el) return;
      const k = kindOf(el);
      const checked = el.getAttribute("aria-checked") === "true";
      if (k === "switch") sfx.play("switch", checked ? "off" : "on");
      else if (k === "tick") sfx.play("tick", checked ? "uncheck" : "check");
      // Keyboard activation has no pointer events, so give it the press sound here.
      else if (e.detail === 0 && k === "click") sfx.play("click", "down");
      else if (e.detail === 0 && k === "tab") sfx.play("tab", "select");
    };
    const over = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || document.body.classList.contains("cal-dragging")) return;
      const el = targetOf(e.target);
      if (!el || (e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) return;
      if (kindOf(el) !== "none") sfx.play("hover", "hover");
    };
    const key = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const typing =
        (t instanceof HTMLTextAreaElement || t.isContentEditable || (t instanceof HTMLInputElement && !/^(checkbox|radio|range|button|submit|color|file)$/.test(t.type)));
      if (!typing) return;
      if (e.key === " ") sfx.play("type", "space");
      else if (e.key.length === 1 || e.key === "Backspace" || e.key === "Enter")
        sfx.play("type", "key", { pitch: 0.92 + ((e.key.charCodeAt(0) * 7) % 9) * 0.02 });
    };

    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("click", click, true);
    document.addEventListener("pointerover", over, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("pointerover", over, true);
      document.removeEventListener("keydown", key, true);
    };
  }, []);
  return null;
}
