declare function print(value: unknown): void;

type Point = { x: number; y: number };

// `satisfies` asserts a type to the compiler and produces the value unchanged, so it erases exactly
// like `as` does. The receiver below is a fresh object literal, which is the shape a coercion would
// break: if `satisfies` were treated as a cast the literal would be boxed.
const origin = { x: 0, y: 0 } satisfies Point;
print(origin.x);

// A wrapped *call* is the case a `kind === "objectLiteral"` check would miss, because the expression's
// kind here is `satisfies` rather than the callee's.
function makePoint(x: number, y: number): Point {
  return { x, y };
}

const made = makePoint(1, 2) satisfies Point;
print(made.y);

// Read through the wrapper, so the unwrapping has to happen before the binding is recorded.
print(made.x);

// A stacked wrapper: `satisfies` inside `as` inside parens, which `unwrapTypeOnlyExpression` recurses
// through rather than testing one level.
type Loose = { x: number; y?: number };
const doubled = { x: 7, y: 8 } satisfies Loose as Point;
print(doubled.x);
print(doubled.y);
