declare function print(value: unknown): void;
const value: any = "hello world";
print(value.includes("hello"));
print(value.startsWith("hello"));
print(value.endsWith("world"));
print(value.indexOf("o"));
print(value.indexOf("z"));
