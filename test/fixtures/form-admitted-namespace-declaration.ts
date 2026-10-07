declare function print(value: unknown): void;

// A namespace's value is the object of its exports, which is the shape an object literal already
// produces, so `N.member` resolves through the same binding the equivalent literal's name would.
namespace N {
  export const v = 1;
  export const label = "text";
}

print(N.v);
print(N.label);

// An exported function is a value in the same object.
namespace Doubler {
  export function twice(x: number): number {
    return x * 2;
  }
}

print(Doubler.twice(21));

// Two namespaces side by side, to show the name is bound per declaration rather than shared.
namespace First {
  export const n = 1;
}

namespace Second {
  export const n = 2;
}

print(First.n + Second.n);

// A namespace member read through a property access twice, and arithmetic on it, which is the same
// path as any other runtime object member.
namespace Counter {
  export const start = 10;
}

print(Counter.start + 5);
