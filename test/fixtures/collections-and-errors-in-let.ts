declare function print(value: unknown): void;

let m = new Map<string, number>();
m.set("a", 1);
m.set("b", 2);
print(m.get("a"));
print(m.size);

var s = new Set<number>([10, 20, 10]);
s.add(30);
print(s.has(20));
print(s.size);

let err: Error = new Error("boom");
print(err.name);
print(err.message);
err = new TypeError("bad");
print(err.name);
print(err.message);
print(err instanceof TypeError);
print(err instanceof Error);

function useLocalCollections(): number {
  let localMap = new Map<string, number>();
  localMap.set("k", 7);
  var localSet = new Set<number>([1, 2, 3]);
  let localErr: Error = new RangeError("oor");
  print(localErr.name);
  return (localMap.get("k") ?? 0) + localSet.size;
}
print(useLocalCollections());
