declare function print(value: unknown): void;

// Both directions of the mapping are in one object, so `Plain.A` reads the number and `Plain[0]` reads
// the name back.
enum Plain { A, B, C }

print(Plain.A);
print(Plain[0]);
print(Plain.C);
print(Plain[2]);

// A numeric initializer sets the number and moves the counter past it, so `Y` is 6 rather than 0. A
// string member has no reverse entry, which is why `Mixed[6]` is `Y` and `Mixed.Z` has no partner.
enum Mixed { X = 5, Y, Z = "s" }

print(Mixed.X);
print(Mixed[5]);
print(Mixed.Y);
print(Mixed[6]);
print(Mixed.Z);

// A numeric initializer after a string member restores the counter, so `C` is 6 and not `undefined`.
enum AfterString { A = "s", B = 5, C }

print(AfterString.A);
print(AfterString.B);
print(AfterString[5]);
print(AfterString.C);
print(AfterString[6]);

// A single member, and a negative one: the sign is part of the constant, and the reverse key is the
// value rendered as a string because a property key is always a string.
enum Negatives { Down = -1, Up = 1 }

print(Negatives.Down);
print(Negatives[-1]);
print(Negatives.Up);

// A non-integer value. The key is the number rendered as a string, exactly as TypeScript emits it.
enum Floats { Half = 0.5 }

print(Floats.Half);
print(Floats[0.5]);

// Two members sharing a value: the reverse entry is written twice and the last one wins, which is what
// an object literal with a repeated key does.
enum Shared { First = 1, Second = 1 }

print(Shared.First);
print(Shared[1]);

// An enum member name may be a string literal, which TypeScript allows for names that are not identifiers.
enum Quoted { "a-b" = 3 }

print(Quoted["a-b"]);
print(Quoted[3]);
