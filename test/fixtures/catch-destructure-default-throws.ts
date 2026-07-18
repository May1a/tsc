// @ts-nocheck
declare function print(value: unknown): void;

function TestError(message: any): any {
  const error = new Error(message);
  return error;
}

try {
  try {
    throw [];
  } catch ([value = (function () { throw new TestError("default"); })()]) {
    print(value);
  }
} catch (error) {
  print("default");
}
