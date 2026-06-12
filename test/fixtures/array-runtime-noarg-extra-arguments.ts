declare function print(value: unknown): void;

const arr: any = ["a", "b", "c"];
arr.reverse("ignored");
print(arr[0]);
print(arr.pop("ignored"));
print(arr.length);
print(arr.shift("ignored"));
print(arr.length);
