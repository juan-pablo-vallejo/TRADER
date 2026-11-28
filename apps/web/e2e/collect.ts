// What the sweep reads of a page (sweep.shots.ts), in the one tree shape
// scripts/sweep/check.mjs reads: every visible element that draws text or can be pressed,
// with its box, its words, its name, whether it is a control, its state, the box it is cut
// to, and whether its words are cut short, broken inside themselves or wider than it.
// Runs inside the page; nothing here reaches the server.
import type { Page } from "@playwright/test";

export type Tree = {
  platform: "web";
  width: number;
  height: number;
  layoutWidth: number;
  nodes: unknown[];
  faults: string[];
};

// `allowed`: the catalogue's strings that end in an ellipsis on purpose.
export async function collect(page: Page, allowed: string[]): Promise<Tree> {
  return page.evaluate((allowedTexts) => {
    const CONTROL =
      'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="radio"], [role="switch"], [role="menuitem"], [role="option"], [tabindex]:not([tabindex="-1"])';
    const modal = document.querySelector("dialog[open]:modal");
    const shown = (el: Element): boolean => {
      if (modal !== null && !modal.contains(el)) return false;
      if (el.closest('[aria-hidden="true"], [inert], .visually-hidden')) return false;
      // A closed disclosure draws its summary alone.
      const closed = el.closest("details:not([open])");
      if (closed !== null && !el.closest("summary")) return false;
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0)
        return false;
      const r = el.getBoundingClientRect();
      // Off the page on purpose, as the skip link is until it has the focus.
      if (r.bottom + scrollY <= 0 || r.right + scrollX <= 0) return false;
      return r.width > 0 && r.height > 0;
    };
    const boxOf = (r: DOMRect) => [
      r.left + scrollX,
      r.top + scrollY,
      r.right + scrollX,
      r.bottom + scrollY,
    ];
    const ownText = (el: Element) =>
      [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    const nameOf = (el: Element): string => {
      const label = el.getAttribute("aria-label");
      if (label) return label.trim();
      const by = el.getAttribute("aria-labelledby");
      if (by)
        return by
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? "")
          .join(" ")
          .trim();
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLSelectElement ||
        el instanceof HTMLTextAreaElement
      ) {
        const own = el.labels?.[0]?.textContent?.trim();
        if (own) return own;
        if (el instanceof HTMLInputElement && ["submit", "button"].includes(el.type))
          return el.value;
        return el.getAttribute("title") ?? el.getAttribute("placeholder") ?? "";
      }
      const text = (el as HTMLElement).innerText?.replace(/\s+/g, " ").trim();
      if (text) return text;
      const img = el.querySelector("img[alt], svg[aria-label]");
      return (
        img?.getAttribute("alt") ??
        img?.getAttribute("aria-label") ??
        el.getAttribute("title") ??
        ""
      ).trim();
    };
    // The nearest box that cuts what it holds, and whether it scrolls: a scroller shows a
    // window on its content by design; a box that hides its overflow cuts it.
    const clipOf = (el: Element): { clip: number[] | null; scrolls: boolean } => {
      for (let p = el.parentElement; p !== null; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (s.overflowX !== "visible" || s.overflowY !== "visible") {
          const scrolls = [s.overflowX, s.overflowY].some(
            (o) => o === "auto" || o === "scroll",
          );
          return { clip: boxOf(p.getBoundingClientRect()), scrolls };
        }
      }
      return { clip: null, scrolls: false };
    };
    const stateOf = (el: Element): { stateful: boolean; state: string | null } => {
      const role = el.getAttribute("role") ?? "";
      if (el instanceof HTMLInputElement && ["checkbox", "radio"].includes(el.type))
        return { stateful: true, state: "native" };
      if (el.tagName === "SUMMARY") return { stateful: true, state: "native" };
      if (["tab", "checkbox", "radio", "switch"].includes(role))
        return {
          stateful: true,
          state: el.getAttribute("aria-selected") ?? el.getAttribute("aria-checked"),
        };
      // A filter in a group of buttons is pressed or not.
      if (el.tagName === "BUTTON" && el.closest('[role="group"]'))
        return { stateful: true, state: el.getAttribute("aria-pressed") };
      // A disclosure says whether it is open.
      if (el.tagName === "BUTTON" && el.hasAttribute("aria-controls"))
        return { stateful: true, state: el.getAttribute("aria-expanded") };
      // The current nav item says it is.
      if (el instanceof HTMLAnchorElement && el.closest("nav")) {
        const here = new URL(el.href, location.href).pathname === location.pathname;
        if (here) return { stateful: true, state: el.getAttribute("aria-current") };
      }
      return { stateful: false, state: null };
    };
    // A word laid over two lines, and the widest word against the box it sits in.
    const words = (el: Element): { broken: boolean; narrow: boolean } => {
      let broken = false;
      let narrow = false;
      const width = el.getBoundingClientRect().width;
      for (const node of el.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE) continue;
        const text = node.textContent ?? "";
        for (const m of text.matchAll(/[^\s\-–—/]{2,}/g)) {
          const range = document.createRange();
          range.setStart(node, m.index);
          range.setEnd(node, m.index + m[0].length);
          const rects = [...range.getClientRects()].filter((r) => r.width > 0);
          if (new Set(rects.map((r) => Math.round(r.top))).size > 1) broken = true;
          if (range.getBoundingClientRect().width > width + 1) narrow = true;
        }
      }
      return { broken, narrow };
    };
    const nodes: unknown[] = [];
    const index = new Map<Element, number>();
    for (const el of document.body.querySelectorAll("*")) {
      if (!shown(el)) continue;
      const text = ownText(el);
      const control =
        el.matches(CONTROL) && !(el as HTMLElement).hasAttribute("disabled");
      if (text === "" && !control) continue;
      // A checkbox or a radio: its line is its target.
      const target =
        el instanceof HTMLInputElement && ["checkbox", "radio"].includes(el.type)
          ? (el.closest("label") ?? el)
          : el;
      const html = el as HTMLElement;
      const s = getComputedStyle(el);
      const clipped =
        s.overflowX !== "visible" ||
        s.textOverflow === "ellipsis" ||
        s.webkitLineClamp !== "none";
      const truncated =
        text !== "" &&
        clipped &&
        (html.scrollWidth > html.clientWidth + 1 ||
          html.scrollHeight > html.clientHeight + 1);
      let parent = -1;
      for (let p = el.parentElement; p !== null; p = p.parentElement) {
        const i = index.get(p);
        if (i !== undefined) {
          parent = i;
          break;
        }
      }
      const { stateful, state } = stateOf(el);
      const { broken, narrow } =
        text === "" ? { broken: false, narrow: false } : words(el);
      index.set(el, nodes.length);
      nodes.push({
        parent,
        box: boxOf(target.getBoundingClientRect()),
        text,
        name: control ? nameOf(el) : text,
        control,
        stateful,
        state,
        ...clipOf(el),
        // Pinned to the screen: over whatever scrolls beneath it, by design.
        pinned: (() => {
          for (let p: Element | null = el; p !== null; p = p.parentElement) {
            const at = getComputedStyle(p).position;
            if (at === "fixed" || at === "sticky") return true;
          }
          return false;
        })(),
        truncated,
        broken,
        narrow,
        ellipsisAllowed:
          allowedTexts.includes(text) || el.closest('[aria-busy="true"]') !== null,
        hidden: false,
      });
    }
    const root = document.scrollingElement ?? document.documentElement;
    const faults: string[] = [];
    if (root.scrollWidth > root.clientWidth)
      faults.push(`scrolls sideways by ${root.scrollWidth - root.clientWidth} px`);
    const moving = document
      .getAnimations()
      .filter(
        (a) =>
          a.playState === "running" &&
          matchMedia("(prefers-reduced-motion: reduce)").matches,
      );
    if (moving.length > 0)
      faults.push(`${moving.length} animations run under reduced motion`);
    return {
      platform: "web" as const,
      width: root.clientWidth,
      height: root.scrollHeight,
      layoutWidth: innerWidth,
      nodes,
      faults,
    };
  }, allowed);
}
