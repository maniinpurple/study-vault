/**
 * The pan key of the document viewer ("Minecraft-style" keybind): Shift or Space switches between drawing a crop box and
 * dragging the document. Two behaviors, chosen in Settings:
 *  - `hold`:   pan mode lasts while the key is held down;
 *  - `toggle`: one press enters pan mode, the next press returns to cropping.
 * Pure: the reducer and the target/key rules are tested; `use-pan-key.ts` wires them to the window.
 */

export const PAN_KEY_MODES = ["hold", "toggle"] as const;
export type PanKeyMode = (typeof PAN_KEY_MODES)[number];
export const DEFAULT_PAN_KEY_MODE: PanKeyMode = "hold";

export interface PanKeyState {
  /** A pan key is currently down (hold mode). */
  held: boolean;
  /** Pan mode was switched on by a press (toggle mode). */
  toggled: boolean;
}

export const INITIAL_PAN_STATE: PanKeyState = { held: false, toggled: false };

export type PanKeyEvent = { type: "down" } | { type: "up" } | { type: "blur" };

/** Whether pan mode is on for this state and behavior. */
export const isPanActive = (state: PanKeyState, mode: PanKeyMode): boolean => (mode === "hold" ? state.held : state.toggled);

/** The next state after a key event. `down` must be a fresh press, not an auto-repeat (the caller filters those). */
export function nextPanState(state: PanKeyState, event: PanKeyEvent, mode: PanKeyMode): PanKeyState {
  switch (event.type) {
    case "down":
      return mode === "hold" ? (state.held ? state : { ...state, held: true }) : { ...state, toggled: !state.toggled };
    case "up":
      return state.held ? { ...state, held: false } : state;
    case "blur":
      // Losing focus can swallow the key-up, so a held key is released. A toggled mode is a deliberate choice and stays.
      return state.held ? { ...state, held: false } : state;
  }
}

export interface KeyLike {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
}

const isSpace = (e: KeyLike) => e.key === " " || e.code === "Space";
const isShift = (e: KeyLike) => e.key === "Shift" || e.code === "ShiftLeft" || e.code === "ShiftRight";

/** Shift or Space on its own: not part of a shortcut such as Ctrl+Space. */
export const isPanKey = (e: KeyLike): boolean => (isSpace(e) || isShift(e)) && !e.ctrlKey && !e.metaKey && !e.altKey;
export const isSpaceKey = isSpace;

/** The parts of a DOM element that decide whether it owns the keyboard. */
export interface TargetLike {
  tagName?: string;
  isContentEditable?: boolean;
}

/**
 * Whether a key press belongs to the focused element rather than to panning. Typing fields always keep both keys (a space or a
 * capital letter must reach them); buttons and links keep Space, which activates them, but still allow Shift.
 */
export function targetKeepsKey(target: TargetLike | null, e: KeyLike): boolean {
  if (!target) return false;
  const tag = (target.tagName ?? "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return true;
  return isSpace(e) && (tag === "BUTTON" || tag === "A" || tag === "SUMMARY");
}
