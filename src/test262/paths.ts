import path from "node:path";

// Both src/test262 (Vitest) and dist/test262 (built CLI) sit two levels below the repository root.
export const repoRoot = path.resolve(import.meta.dirname, "../..");
export const pinPath = path.join(repoRoot, "test262", "pin.json");
export const filtersPath = path.join(repoRoot, "test262", "filters.json");
export const defaultCacheDir = path.join(repoRoot, "build", "test262");
export const defaultCheckoutDir = path.join(defaultCacheDir, "checkout");
