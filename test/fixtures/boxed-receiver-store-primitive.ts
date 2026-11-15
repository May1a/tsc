declare function print(value: unknown): void;

// A property store through a boxed primitive throws a TypeError, as a module's strict code does.
const xs: any[] = [5, "s", true, undefined, null];
for (let i = 0; i < xs.length; i++) {
  const t = xs[i];
  try {
    t["k"] = 1;
    print("stored");
  } catch (error: any) {
    print(error.name);
  }
}
print("after");
