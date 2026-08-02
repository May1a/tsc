declare function print(value: unknown): void;

print(String.fromCharCode(104, 105));
print(String.fromCharCode(65));
print(String.fromCharCode(112, 113, 114, 115, 116));
print("[" + String.fromCharCode() + "]");
const code = 111;
print(String.fromCharCode(104, code, 119));
