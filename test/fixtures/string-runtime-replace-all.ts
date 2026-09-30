declare function print(value: unknown): void;

const s: string = "a-b-c";
const r: string = s.replaceAll("-", "+");
print(r);