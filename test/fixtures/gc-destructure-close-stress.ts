declare function print(value: unknown): void;

class Waste {
  value: number;

  constructor(value: number) {
    this.value = value;
  }
}

class Payload {
  message: string;

  constructor(message: string) {
    this.message = message;
  }
}

// Allocating cleanup: crosses the collection threshold under a constrained
// heap, so the pending thrown payload must stay rooted while it runs.
function churn(): void {
  for (let index = 0; index < 40000; index = index + 1) {
    const waste = new Waste(index);
    if (waste.value < 0) {
      print(waste.value);
    }
  }
}

function fail(): unknown {
  throw new Payload("pending");
}

const iterable = {
  [Symbol.iterator]() {
    return {
      next() {
        return { value: undefined, done: false };
      },
      return() {
        churn();
        return { value: undefined, done: true };
      }
    };
  }
};

// The default throws before the binding completes, so the thrown payload is
// the pending completion while IteratorClose runs the allocating return().
try {
  const [value = fail()] = iterable as any;
  print(value);
} catch (error: any) {
  print(error.message);
}
