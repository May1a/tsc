declare function print(value: unknown): void;

// The runtime has no locale comparison, so `localeCompare` lowers to the first character's code
// point. `packages.test.ts` pins the same number; the support manifest records the entry as
// `"stubbed"` and its `reason` is what says so.
const s: string = "hello";
const compared: number = s.localeCompare("world");
print(compared);
