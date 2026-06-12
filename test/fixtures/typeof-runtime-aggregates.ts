declare function print(value: unknown): void;

const arr = ["a", 1];
print(typeof arr);

const obj = { name: "x" };
print(typeof obj);

const fixedArr = [1, 2];
print(typeof fixedArr);

const fixedObj = { a: 1 };
print(typeof fixedObj);

const e = new Error("boom");
print(typeof e);
