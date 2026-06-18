declare function print(value: unknown): void;

const obj = { a: 1, b: "x", c: true, d: null };
print(JSON.stringify(obj));

const nested = { inner: { k: "v" }, num: 2 };
print(JSON.stringify(nested));

const skipped: { u?: unknown; k: string } = { u: undefined, k: "v" };
print(JSON.stringify(skipped));

const err = new Error("hidden");
print(JSON.stringify(err));

const quoted = { text: 'say "hi"\n' };
print(JSON.stringify(quoted));
