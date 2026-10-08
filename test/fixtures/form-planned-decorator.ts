declare function print(value: unknown): void;

function d(t: unknown): void { print("decorator ran"); }
@d
class C { n(): number { return 1; } }
print(new C().n());
