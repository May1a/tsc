declare function print(value: unknown): void;

// A negative start position counts back from the end of the array.
const xs: any[] = [3, 1, 2, 3];
print(xs.indexOf(3, -1));
print(xs.indexOf(3, -2));
print(xs.indexOf(1, -4));
print(xs.indexOf(1, -9));
print(xs.lastIndexOf(3, -2));
print(xs.lastIndexOf(1, -4));
print(xs.lastIndexOf(3, -9));
