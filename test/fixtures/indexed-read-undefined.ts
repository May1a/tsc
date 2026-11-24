declare function print(value: unknown): void;

// An indexed read is typed as its element, but finds nothing past the end.
function element(a: number[], i: number): number | undefined { return a[i]; }
print(element([1], 3));
print(element([1], 0));
function kind(a: number[], i: number): string { const x = a[i]; return typeof x; }
print(kind([1], 3));
function character(s: string, i: number): string | undefined { return s[i]; }
print(character("ab", 2) === undefined);
print(character("ab", 1));
function entry(record: Record<string, number>, key: string): string { const v = record[key]; return v === undefined ? "none" : "has"; }
print(entry({ a: 1 }, "b"));
print(entry({ a: 1 }, "a"));
