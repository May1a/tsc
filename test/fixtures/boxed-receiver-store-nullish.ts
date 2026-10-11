declare function print(value: unknown): void;

// A store or delete through undefined throws a TypeError instead of writing through a non-pointer.
const holder: any = {};
try {
  const inner = holder.missing;
  inner.x = 1;
} catch (error: any) {
  print(error.name);
}
try {
  const inner = holder.missing;
  delete inner.x;
} catch (error: any) {
  print(error.name);
}
