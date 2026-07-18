// @ts-nocheck
declare function print(value: unknown): void;

function Factory(): any {
  const result = new Error("made");
  result.value = 7;
  return result;
}

const made = new Factory();
print(made.value);
