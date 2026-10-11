declare function print(value: unknown): void;

// Stores and deletes through boxed objects, arrays and functions reach the receiver's own storage.
const items: any[] = [{ a: 1 }, [1, 2, 3], function named() { return 1; }];
const o = items[0];
o["b"] = 2;
o.c = 3;
print(o.b + o.c);
delete o.b;
print(o.b === undefined);
const a = items[1];
a[5] = 9;
print(a.length);
a.length = 2;
print(a.length);
print(a[1]);
delete a[0];
print(a[0] === undefined);
a.extra = "x";
print(a.extra);
const f = items[2];
f.tag = "t";
print(f.tag);
try {
  f.name = "other";
} catch (error: any) {
  print(error.name);
}
