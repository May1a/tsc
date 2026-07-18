// @ts-nocheck
declare function print(value: unknown): void;

class Box {
  value: number;

  constructor(value: number) {
    this.value = value;
  }
}

function allocateAndThrow(keep: number): void {
  const error = new Box(keep);
  for (let index = 0; index < 25000; index = index + 1) {
    const temporary = new Box(index);
    if (temporary.value < 0) {
      print(temporary.value);
    }
  }
  error.value = keep;
  throw error;
}

try {
  try {
    throw [7, undefined];
  } catch ([keep, value = allocateAndThrow(keep)]) {
    print(value);
  }
} catch (error) {
  print(error.value);
}
