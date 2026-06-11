declare function print(value: unknown): void;

const descriptors = Object.getOwnPropertyDescriptors(1);
print(descriptors);
