declare function print(value: unknown): void;

function d(value: unknown, context: unknown): void { print("decorator ran"); }
class C { @d n = 1; }
print(new C().n);
