declare function print(value: unknown): void;

const arr = ["a", "b", "c"];
const [x, y, z] = arr;
print(x);
print(y);
print(z);

const [first] = ["direct", "other"];
print(first);

const nums = [10, 20];
const [n1, n2] = nums;
print(n1);
print(n2);
