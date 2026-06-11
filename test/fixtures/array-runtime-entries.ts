declare function print(value: unknown): void;

const arr: unknown[] = ["zero"];
arr[3] = "three";

const entries: any[] = Object.entries(arr);

print(entries.length);
print(entries[0][0]);
print(entries[0][1]);
print(entries[1][0]);
print(entries[1][1]);
