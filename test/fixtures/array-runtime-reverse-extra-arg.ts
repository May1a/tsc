declare function print(value: unknown): void;

const arr: any = ["a"];
arr.reverse("extra");
print(arr[0]);
