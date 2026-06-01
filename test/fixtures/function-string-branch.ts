declare function print(value: unknown): void;

function greet(name: string) {
  if (name === "Ada") {
    print("hello " + name);
  } else {
    print("hello stranger");
  }
}

greet("Ada");
