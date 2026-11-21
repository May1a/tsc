declare function print(value: unknown): void;

class Widget {
  v = 1;
}

const w = new Widget();
print(typeof w);
if (typeof w === "object") {
  print("instance-is-object");
}

let dyn: unknown = 42;
print(typeof dyn);
dyn = "hello";
print(typeof dyn);
dyn = true;
print(typeof dyn);
dyn = null;
print(typeof dyn);
dyn = undefined;
print(typeof dyn);
dyn = { a: 1 };
print(typeof dyn);
dyn = [1, 2];
print(typeof dyn);
dyn = () => 1;
print(typeof dyn);

const m = new Map<string, number>();
const s = new Set<number>();
print(typeof m);
print(typeof s);

function produce(tag: number): unknown {
  if (tag === 0) return "text";
  if (tag === 1) return 123;
  return new Widget();
}
print(typeof produce(0));
print(typeof produce(1));
print(typeof produce(2));
print(typeof ({ inner: "ok" } as Record<string, unknown>).inner);
