declare function print(value: unknown): void;

function makeNamed(): any {
  const [retained = () => {}] = [];
  return retained;
}

const saved = makeNamed();
for (let index = 0; index < 25000; index = index + 1) {
  const [temporary = () => {}] = [];
  if (temporary.name === "never") {
    print(index);
  }
}

print(saved.name);
