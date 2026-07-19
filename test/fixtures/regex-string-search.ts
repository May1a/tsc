declare function print(value: unknown): void;

const global = /x/g;
print("éx".search(global));
print(global.lastIndex);
print("abc".search(/z/));
