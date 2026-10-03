declare function print(value: unknown): void;

// `toString(radix)` is lowered to the integer part only, so the fixture pins an integer.
// The support manifest records the entry as `"stubbed"` and its reason says why.
const n: number = 255;
const r: string = n.toString(16);
print(r);