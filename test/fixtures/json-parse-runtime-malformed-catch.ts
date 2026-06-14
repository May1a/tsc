declare function print(value: unknown): void;

const text = "{bad json";
try {
  JSON.parse(text);
} catch (e) {
  print(e instanceof SyntaxError ? e.name : "wrong");
  print(e instanceof SyntaxError && e.message.length > 0);
}
