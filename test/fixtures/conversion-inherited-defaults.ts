declare function print(value: unknown): void;
class C { valueOf() { return 7; } } const c = new C(); print(String(c)); print('x' + c);
