declare function print(value: unknown): void;
const source: any = { length: 0 };
source[Symbol.iterator] = function iterator(): unknown {
  return source;
};
const result = Array.from(source);
print(result.length);
