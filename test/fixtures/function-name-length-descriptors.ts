declare function print(value: unknown): void;

function declared(two: number, args: number) {}
function stopsAtDefault(x: number, y = 42, z: number) {}
function allDefaults(x = 1, y = 2) {}

const arrow = () => {};
const fn = function () {};
const named = function inner() {};

// Inferred names for anonymous initializers; own name for named expressions.
print(arrow.name);
print(fn.name);
print(named.name);

const declaredBox: any[] = [declared];
const declaredTarget = declaredBox[0];
const arrowBox: any[] = [arrow];
const arrowTarget = arrowBox[0];
const stopsBox: any[] = [stopsAtDefault];
const stopsTarget = stopsBox[0];
const allBox: any[] = [allDefaults];
const allTarget = allBox[0];

print(Object.hasOwn(declaredTarget, "name"));
print(Object.hasOwn(declaredTarget, "length"));

const nameDesc = Object.getOwnPropertyDescriptor(declaredTarget, "name")!;
print(nameDesc.value);
print(nameDesc.writable);
print(nameDesc.enumerable);
print(nameDesc.configurable);

const arrowNameDesc = Object.getOwnPropertyDescriptor(arrowTarget, "name")!;
print(arrowNameDesc.value);

const declaredLength = Object.getOwnPropertyDescriptor(declaredTarget, "length")!;
print(declaredLength.value);
print(declaredLength.writable);
print(declaredLength.enumerable);
print(declaredLength.configurable);

// Length stops at the first parameter with a default initializer.
const stopsLength = Object.getOwnPropertyDescriptor(stopsTarget, "length")!;
print(stopsLength.value);
const allLength = Object.getOwnPropertyDescriptor(allTarget, "length")!;
print(allLength.value);

// name/length are configurable: deleting them removes the own property and
// reads fall back to the Function.prototype defaults ("" and 0).
const nameKey = "name";
delete declaredTarget[nameKey];
print(Object.hasOwn(declaredTarget, "name"));
print(declaredTarget[nameKey]);

const lengthKey = "length";
delete stopsTarget[lengthKey];
print(Object.hasOwn(stopsTarget, "length"));
print(stopsTarget[lengthKey]);
