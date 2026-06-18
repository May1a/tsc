declare function print(value: unknown): void;
const s: any = new String("hello");
print(s.valueOf());
print(s.length);
