declare function print(value: unknown): void;

// The runtime error object has no `cause` field, so reading one yields `undefined` — which is what
// JavaScript returns for an error constructed without options. Constructing one *with* options is
// not supported, so a program can read a cause but cannot set one.
const error = new Error("boom");
print(error.cause);
