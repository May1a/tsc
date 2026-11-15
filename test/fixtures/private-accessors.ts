declare function print(value: unknown): void;

// Reading a private accessor calls its getter, and writing it calls its setter.
class Temperature {
  #celsius = 20;
  get #fahrenheit() {
    return this.#celsius * 9 / 5 + 32;
  }
  set #fahrenheit(value: number) {
    this.#celsius = (value - 32) * 5 / 9;
  }
  get #label() {
    return "temp";
  }
  read() {
    return this.#fahrenheit;
  }
  write(value: number) {
    this.#fahrenheit = value;
    return this.#celsius;
  }
  name() {
    return this.#label;
  }
  static peek(o: any) {
    return o.#fahrenheit;
  }
}
const t = new Temperature();
print(t.read());
print(t.write(212));
print(t.read());
print(t.name());
print(Temperature.peek(t));
try {
  Temperature.peek({});
} catch (error: any) {
  print(error.name);
}
print(JSON.stringify(t));
