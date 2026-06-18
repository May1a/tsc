declare function print(value: unknown): void;

const arr: unknown[] = ["a", , undefined, "d"];
print(arr.join("-"));
