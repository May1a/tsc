declare function print(value: unknown): void;

const arr: unknown[] = [1, "two", true, null];
print(JSON.stringify(arr));

const empty: unknown[] = [];
print(JSON.stringify(empty));

const holes: unknown[] = ["a"];
holes[2] = "c";
print(JSON.stringify(holes));
