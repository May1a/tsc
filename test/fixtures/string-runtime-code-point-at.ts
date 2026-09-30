declare function print(value: unknown): void;

// The lowered slice is a single code unit, so an ASCII character is the whole story. The lib type
// says the result may be undefined for an out-of-range index; this index is in range.
const s: string = "Hello";
const code: number = s.codePointAt(1) as number;
print(code);
