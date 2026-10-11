declare function print(value: unknown): void;

function sideEffect(): number {
  print("effect");
  return 1;
}

const absentUndefined: { f(): number; g(n: number): number } | undefined = undefined as { f(): number; g(n: number): number } | undefined;
const absentNull: { f(): number; g(n: number): number } | null = null as { f(): number; g(n: number): number } | null;
const present: { f(): number; g(n: number): number } = {
  f: () => 7,
  g: (n: number) => n
};

// Optional member calls used as values.
print(absentUndefined?.f());
print(absentNull?.f());
print(absentUndefined?.g(sideEffect()));
print(absentNull?.g(sideEffect()));
print(present?.f());
print(present?.g(sideEffect()));

// The same calls used as statements.
absentUndefined?.f();
absentNull?.f();
absentUndefined?.g(sideEffect());
absentNull?.g(sideEffect());
present?.f();
present?.g(sideEffect());
print("statements done");

// A chained call short-circuits on the first nullish link.
const chain: { b: { f(): number } } | undefined = undefined as { b: { f(): number } } | undefined;
print(chain?.b.f());

class S {
  area(): number {
    return 3;
  }
}

const mixed: (S | undefined)[] = [new S(), undefined];
for (const s of mixed) {
  print(s?.area());
}

// Union-typed receivers that bound an inlineable value dispatch the same way.
const toggle: S | undefined = (1 > 2) ? new S() : undefined;
print(toggle?.area());

function showArea(s: S): void {
  print(s?.area());
  s?.area();
  print("method done");
}
showArea(new S());

// The optional-callee form only skips when the method itself is missing.
const partial: { f?(): number } = {};
print(partial.f?.());
const full: { f?(): number } = {
  f: () => 9
};
print(full.f?.());
