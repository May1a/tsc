declare function print(value: unknown): void;

function recursive(n: number): number {
  function go(v: number): number { return v <= 0 ? 0 : 1 + go(v - 1); }
  return go(n);
}
print(recursive(3));
function mutual(n: number): number {
  function a(v: number): number { return v <= 0 ? 7 : b(v - 1); }
  function b(v: number): number { return a(v); }
  return a(n);
}
print(mutual(3));
function viaArrow(n: number): string {
  const seen = new Set<number>();
  function go(v: number, d = 0): string {
    if (v <= 0) return "x";
    seen.add(v);
    return `${[v].map((x) => go(x - 1, d + 1)).join(",")}:${d}`;
  }
  return go(n) + seen.size;
}
print(viaArrow(3));
function throughMethods(f: (x: number) => number) {
  return { make() { let i = 0; return { next() { i += 1; return f(i); } }; } };
}
const made = throughMethods((x) => x * 3).make();
made.next();
print(made.next());
function collections(): () => number | undefined {
  const cache = new Map<string, number>();
  const put = (key: string, value: number): void => { cache.set(key, value); };
  put("a", 1);
  return () => cache.get("a");
}
print(collections()());
