declare function print(value: unknown): void;

try {
  const undefinedResult = Array.from(undefined as any);
  print(undefinedResult.length);
} catch (error: any) {
  print(error.message);
}

try {
  const nullResult = Array.from(null as any);
  print(nullResult.length);
} catch (error: any) {
  print(error.message);
}

try {
  const mapperResult = Array.from([1], 1 as any);
  print(mapperResult.length);
} catch (error: any) {
  print(error.message);
}
