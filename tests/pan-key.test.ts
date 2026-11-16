import { describe, expect, it } from "vitest";

import { INITIAL_PAN_STATE, isPanActive, isPanKey, nextPanState, targetKeepsKey, type PanKeyEvent, type PanKeyMode } from "@/lib/pan-key";

const run = (mode: PanKeyMode, events: PanKeyEvent["type"][]) => events.reduce((state, type) => nextPanState(state, { type }, mode), INITIAL_PAN_STATE);

describe("pan key behaviors", () => {
  it("hold: pan mode lasts exactly as long as the key is down", () => {
    expect(isPanActive(run("hold", []), "hold")).toBe(false);
    expect(isPanActive(run("hold", ["down"]), "hold")).toBe(true);
    expect(isPanActive(run("hold", ["down", "up"]), "hold")).toBe(false);
  });

  it("hold: losing window focus releases a key whose key-up never arrives", () => {
    expect(isPanActive(run("hold", ["down", "blur"]), "hold")).toBe(false);
  });

  it("toggle: one press enters pan mode, the next press leaves it, key-up changes nothing", () => {
    expect(isPanActive(run("toggle", ["down"]), "toggle")).toBe(true);
    expect(isPanActive(run("toggle", ["down", "up"]), "toggle")).toBe(true);
    expect(isPanActive(run("toggle", ["down", "up", "down", "up"]), "toggle")).toBe(false);
    expect(isPanActive(run("toggle", ["down", "up", "blur"]), "toggle")).toBe(true);
  });

  it("returns the same object when nothing changes (no needless render)", () => {
    expect(nextPanState(INITIAL_PAN_STATE, { type: "up" }, "hold")).toBe(INITIAL_PAN_STATE);
    expect(nextPanState(INITIAL_PAN_STATE, { type: "blur" }, "toggle")).toBe(INITIAL_PAN_STATE);
    const held = run("hold", ["down"]);
    expect(nextPanState(held, { type: "down" }, "hold")).toBe(held);
  });
});

describe("which keys and targets count", () => {
  it("accepts Shift and Space alone, never as part of a shortcut", () => {
    expect(isPanKey({ key: " ", code: "Space" })).toBe(true);
    expect(isPanKey({ key: "Shift", code: "ShiftLeft" })).toBe(true);
    expect(isPanKey({ key: "a" })).toBe(false);
    expect(isPanKey({ key: " ", ctrlKey: true })).toBe(false);
    expect(isPanKey({ key: "Shift", metaKey: true })).toBe(false);
  });

  it("leaves typing fields to the user, and Space to buttons and links", () => {
    const space = { key: " ", code: "Space" };
    const shift = { key: "Shift", code: "ShiftLeft" };
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) {
      expect(targetKeepsKey({ tagName }, space)).toBe(true);
      expect(targetKeepsKey({ tagName }, shift)).toBe(true);
    }
    expect(targetKeepsKey({ tagName: "DIV", isContentEditable: true }, space)).toBe(true);
    expect(targetKeepsKey({ tagName: "BUTTON" }, space)).toBe(true);
    expect(targetKeepsKey({ tagName: "BUTTON" }, shift)).toBe(false);
    expect(targetKeepsKey({ tagName: "BODY" }, space)).toBe(false);
    expect(targetKeepsKey(null, space)).toBe(false);
  });
});
