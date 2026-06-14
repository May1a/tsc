declare function print(value: unknown): void;

const re = /foo/gi;
print(re.source);
print(re.flags);
print(re.global);
print(re.ignoreCase);
print(re.multiline);
print(re.sticky);
print(re.lastIndex);
