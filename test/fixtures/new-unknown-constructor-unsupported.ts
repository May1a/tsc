declare function print(value: unknown): void;

function Test262Error(message: any): any {
  return message;
}

// `Test262Error` is a plain function, not a lowered class: the refusal names the constructor rather
// than the initializer around it.
const e = new Test262Error("boom");
print(e);
