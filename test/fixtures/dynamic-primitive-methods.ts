declare function print(value: unknown): void;

// The receivers are only known to be `any`, so every method is found through the runtime prototypes.
const text = (s: any): any => [s.slice(1, 3), s.indexOf("o"), s.split(" ").join("|"), s.toUpperCase(), s.charAt(1),
  s.padEnd(13, "*"), s.replace("World", "X"), s.startsWith("Hell"), s.concat("a", 1), s.at(-1), s.repeat(2)].join(";");
print(text("Hello World"));
const patterns = (s: any): any => [s.replace(/[0-9]+/g, "#"), s.split(/[0-9]+/).join("|"), s.match(/[0-9]+/g).join(), s.search(/2/)].join(";");
print(patterns("a1b22"));
const convert = (x: any): any => x.toString();
print(convert("q") + convert(3) + convert(true) + convert([1, 2]));
const radix = (x: any, r: any): any => x.toString(r);
print(radix(255, 16));
const regex: any = /ab+/g;
print(regex.test("xabb"));
print(regex.toString());
const method = (s: any): any => s.slice;
print(method("a") === method("b"));
