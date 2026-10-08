declare function print(value: unknown): void;
function fallback(): { a: number } { print("object fallback"); return { a: 9 }; }
const rows: [{ a: number }?][] = [[{ a: 1 }], [], [{ a: 2 }]];
for (const [{ a } = fallback()] of rows) { print(a); }
function makeItem(): { a: number } { return { a: 3 }; }
const item = makeItem();
const objects: { item?: { a: number } }[] = [{ item }, {}];
for (const { item: { a } = fallback() } of objects) { print(a); }
