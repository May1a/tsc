declare function print(value: unknown): void;
let n = 0; class C { toString() { return String(n); } } const c = new C(); function rhs() { n = 1; return '!'; } print(c + rhs());
