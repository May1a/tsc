declare function print(value: unknown): void;

function Test262Error(message: any): any {
  return message;
}

// A function that does not type `this` constructs an implicit `any`, which TypeScript rejects.
const e = new Test262Error("boom");
print(e);
