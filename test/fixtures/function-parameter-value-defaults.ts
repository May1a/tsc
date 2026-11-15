declare function print(value: unknown): void;

// A default of any kind applies when the argument is missing or undefined, however the function is called.
function f(x = "s") { return x; }
print(f());
print(f(undefined));
print(f("given"));
const k: any = f;
print(k());
function g(o: any = { k: 1 }) { return o.k; }
print(g());
function h(n = 2, m = n * 3) { return n + m; }
print(h());
print(h(1));
function u(b = true) { return b; }
print(u());
let calls = 0;
function side() { calls += 1; return calls; }
function lazy(v = side()) { return v; }
print(lazy(5));
print(calls);
print(lazy());
print(calls);
function pat({ a = 1 }: any = {}) { return a; }
print(pat());
print(pat({ a: 7 }));
function cb(fn = () => "arrow") { return fn(); }
print(cb());
