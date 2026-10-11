declare function print(value: unknown): void;

// A `let` array pattern binds each name in a slot that later writes of any type reuse.
let [a, b = 5, ...rest]: any[] = [1, undefined, 3, 4];
print(a); print(b); print(rest.length);
a = "now a string";
b += 1;
print(a); print(b);
let [x, [y, z = "z"]]: any[] = [1, [2]];
print(x + y); print(z);
y = 10;
print(y);
const pairs: any[] = [[1, "one"], [2, "two"]];
let [first] = pairs;
let [n, label] = first;
print(n); print(label);
