declare function print(value: unknown): void;

const broken = JSON.parse("{bad json");
print(broken);
