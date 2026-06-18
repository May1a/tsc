declare function print(value: unknown): void;

const arr: any = ["zero"];
arr["01"] = "leading";
arr["-1"] = "negative";
arr["1.5"] = "fraction";
print(arr.length);
print(arr[0]);
print(arr["01"]);
print(arr["-1"]);
print(arr["1.5"]);
print(Object.hasOwn(arr, "01"));
delete arr["01"];
print(Object.hasOwn(arr, "01"));
print(arr["01"]);
