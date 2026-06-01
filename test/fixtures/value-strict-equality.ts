declare function print(value: unknown): void;

const one: unknown = 1;
const anotherOne: unknown = 1;
const truthy: unknown = true;
const falsy: unknown = false;
const missing: unknown = undefined;
const alsoMissing: unknown = undefined;
const firstString: unknown = "same reference";
const secondString: unknown = "same reference";

if (one === anotherOne) {
  print("numbers equal");
}

if (truthy !== falsy) {
  print("booleans differ");
}

if (missing === alsoMissing) {
  print("undefined equal");
}

if (firstString !== secondString) {
  print("strings are references");
}
