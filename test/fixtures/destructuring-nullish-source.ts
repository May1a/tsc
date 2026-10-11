declare function print(value: unknown): void;

// Destructuring null, undefined or a non-iterable throws a TypeError, whatever declares it.
try {
  let [a] = null as any;
  print(a);
} catch (error: any) {
  print(error.name);
}
try {
  let { b } = undefined as any;
  print(b);
} catch (error: any) {
  print(error.name);
}
try {
  var [c] = 5 as any;
  print(c);
} catch (error: any) {
  print(error.name);
}
