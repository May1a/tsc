// @ts-nocheck
declare function print(value: unknown): void;

function TestError(message: any): any {
  const error = new Error(message);
  return error;
}

try {
  throw [7];
} catch ([value = (function () { throw new TestError("should not run"); })()]) {
  print(value);
}
