declare function print(value: unknown): void;

const partial: { present?(): void; absent?(): void } = {
  present: () => {
    print("present");
  }
};

// A nullish callee short-circuits instead of dispatching on `undefined`.
partial.absent?.();
print("skipped");
partial.present?.();
print("done");
