declare function print(value: unknown): void;

const arr: unknown[] = ["a"];
arr.reverse("extra");
print(arr[0]);
