declare function print(value: unknown): void;

// A call through a boxed callee typed `any` or `unknown` keeps its result as a value. Printing it
// must not coerce a string or object to a number.
const fns: any[] = [];
fns.push(() => "a");
for (const f of fns) {
  print(f());
}
const first = fns[0];
print(first());

const label: any = () => "x";
print(label());
print(label() + "!");

const opaque: () => unknown = () => "unknown result";
print(opaque());

function spreadLabel(...parts: number[]): any {
  return "parts:" + parts.length;
}
const counts = [1, 2];
print(spreadLabel(...counts));

// A call typed `number` still lowers numerically.
const three: () => number = () => 3;
print(three() * 2);
