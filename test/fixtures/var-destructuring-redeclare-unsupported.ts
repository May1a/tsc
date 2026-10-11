declare function print(value: unknown): void;

// A `var` pattern that redeclares a binding of its own scope would have to write that binding.
var a: any = 1;
var [a]: any[] = [2];
print(a);
