/** The three ways a collection (Problem Vault, Sources) can be shown. */
export const VIEW_MODES = ["grid", "list", "box"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];
