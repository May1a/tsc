declare function print(value: unknown): void;

// JSON gives runtime nulls in a well-typed iterable, rather than a frontend error.
const rows: { value?: number }[] = JSON.parse("[null]");
try {
  for (const { value } of rows) { print(value); }
} catch (error) { print(error instanceof TypeError); }
try {
  for (const {} of rows) { print("unexpected body"); }
} catch (error) { print(error instanceof TypeError); }

const nested: { value?: number }[][] = JSON.parse("[[null]]");
try {
  for (const [{ value }] of nested) { print(value); }
} catch (error) { print(error instanceof TypeError); }

const missing: { value: { inner?: number } }[] = JSON.parse("[{}]");
try {
  for (const { value: {} } of missing) { print("unexpected nested body"); }
} catch (error) { print(error instanceof TypeError); }

const iterable = {
  [Symbol.iterator]() {
    return {
      next(): IteratorResult<{ value?: number }> {
        const values: { value?: number }[] = JSON.parse("[null]");
        return { value: values[0], done: false };
      },
      return(): IteratorResult<{ value?: number }> { print("closed"); return { value: undefined, done: true }; }
    };
  }
};
try {
  for (const {} of iterable) { print("unexpected iterator body"); }
} catch (error) { print(error instanceof TypeError); }
