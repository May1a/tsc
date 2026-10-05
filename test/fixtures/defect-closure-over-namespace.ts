declare function print(value: unknown): void;

// The same gap as `defect-closure-over-object-literal.ts`, through the namespace lowering rather than an
// object literal — which matters because `namespace` is an admitted form. A namespace binds an object, and
// a function that reads one resolves the reference as a frame slot that nothing allocated, so clang
// rejects the module:
//
//   error: use of undefined value '%Config.addr'
//
// The failure reaches clang rather than dying in the emitter, so it surfaces as TSCN2001/TSCN2003. That
// makes it worse than silent, not better: a program that is correct TypeScript fails at link time.
namespace Config {
  export const limit = 7;
}

function readLimit(): number {
  return Config.limit;
}

print(readLimit());
