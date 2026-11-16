"use client";

import { AnimatePresence, motion } from "framer-motion";
import { PenLine, Pencil, Sigma, X } from "lucide-react";
import * as React from "react";

import { useI18n } from "@/components/app-provider";
import { MathPad } from "@/components/math-pad";
import { Scratchpad } from "@/components/scratchpad";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

type ToolId = "scratchpad" | "mathpad";

const ITEMS = [
  { id: "mathpad", icon: Sigma },
  { id: "scratchpad", icon: PenLine },
] as const satisfies readonly { id: ToolId; icon: typeof Sigma }[];

/**
 * The speed-dial button at the bottom-right, in the style of Samsung Notes: one round button that opens, straight above it, a
 * button for the Scratchpad and one for the Math Pad. Each opens its own draggable window; both can be open at once.
 * Mounted once in the app shell, so the windows (and the Scratchpad's drawing) survive moving between pages.
 */
export function FloatingTools() {
  const { t } = useI18n();
  const [menu, setMenu] = React.useState(false);
  const [openTools, setOpenTools] = React.useState<Record<ToolId, boolean>>({ scratchpad: false, mathpad: false });
  const root = React.useRef<HTMLDivElement>(null);
  const label: Record<ToolId, string> = { scratchpad: t.fab.scratchpad, mathpad: t.fab.mathpad };

  // The menu closes on Escape and on a click anywhere else.
  React.useEffect(() => {
    if (!menu) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const toggleTool = (id: ToolId) => {
    setOpenTools((prev) => ({ ...prev, [id]: !prev[id] }));
    setMenu(false);
  };
  const close = (id: ToolId) => setOpenTools((prev) => ({ ...prev, [id]: false }));

  return (
    // Covers the screen but takes no clicks itself: only the button, the menu and the windows are interactive.
    // z-70 keeps it above the image lightbox (z-60) and the mobile sidebar sheet (z-50).
    <div className="pointer-events-none fixed inset-0 z-[70]">
      <Scratchpad open={openTools.scratchpad} onClose={() => close("scratchpad")} />
      <MathPad open={openTools.mathpad} onClose={() => close("mathpad")} />

      <div ref={root} className="pointer-events-none absolute right-4 bottom-4 flex flex-col items-end gap-3 sm:right-6 sm:bottom-6">
        <AnimatePresence>
          {menu && (
            <motion.ul
              id="fab-menu"
              role="menu"
              aria-label={t.fab.open}
              initial="hidden"
              animate="shown"
              exit="hidden"
              variants={{ shown: { transition: { staggerChildren: 0.05, staggerDirection: -1 } }, hidden: { transition: { staggerChildren: 0.03 } } }}
              className="flex flex-col items-end gap-2.5"
            >
              {ITEMS.map(({ id, icon: Icon }) => (
                <motion.li
                  key={id}
                  variants={{ hidden: { opacity: 0, y: 14, scale: 0.85 }, shown: { opacity: 1, y: 0, scale: 1 } }}
                  transition={spring.snappy}
                  className="pointer-events-auto flex items-center gap-2.5"
                >
                  <span className="rounded-md border-2 border-border bg-popover px-2.5 py-1 text-sm shadow-xs" aria-hidden>
                    {label[id]}
                  </span>
                  <button
                    type="button"
                    data-fab="item"
                    role="menuitemcheckbox"
                    aria-label={label[id]}
                    aria-checked={openTools[id]}
                    onClick={() => toggleTool(id)}
                    className={cn(
                      "grid size-11 place-items-center rounded-full border-2 border-border shadow-md transition-transform hover:-translate-y-px active:translate-x-(--press) active:translate-y-(--press) active:shadow-none",
                      openTools[id] ? "bg-primary text-primary-foreground" : "bg-card text-foreground",
                    )}
                  >
                    <Icon className="size-5" aria-hidden />
                  </button>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={() => setMenu((v) => !v)}
          data-fab="main"
          aria-expanded={menu}
          aria-controls={menu ? "fab-menu" : undefined}
          aria-haspopup="menu"
          aria-label={menu ? t.fab.close : t.fab.open}
          title={menu ? t.fab.close : t.fab.open}
          className="pointer-events-auto grid size-12 place-items-center rounded-full border-2 border-border bg-primary text-primary-foreground shadow-md transition-transform hover:-translate-y-px active:translate-x-(--press) active:translate-y-(--press) active:shadow-none"
        >
          <motion.span animate={{ rotate: menu ? 90 : 0 }} transition={spring.snappy} className="grid place-items-center">
            {menu ? <X className="size-5" aria-hidden /> : <Pencil className="size-5" aria-hidden />}
          </motion.span>
        </button>
      </div>
    </div>
  );
}
