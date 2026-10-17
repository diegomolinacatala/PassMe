/**
 * "Crea la tuya" in one import, for server code and tests. The code lives in
 * three zod-free modules so each client component can pull in only what it
 * uses: ./quick-draft (the draft), ./quick-form (validation and the card it
 * becomes) and ./paths (links to /crear).
 */
export * from "./quick-draft";
export * from "./quick-form";
