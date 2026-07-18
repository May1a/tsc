declare function print(value: unknown): void;

let breakLog = "";
for (let i = 0; i < 3; i = i + 1) {
  try {
    breakLog = breakLog + "b" + i;
    if (i === 1) {
      break;
    }
  } finally {
    breakLog = breakLog + "f" + i;
  }
}
print(breakLog);

let continueLog = "";
for (let j = 0; j < 3; j = j + 1) {
  try {
    if (j === 1) {
      continue;
    }
    continueLog = continueLog + "b" + j;
  } finally {
    continueLog = continueLog + "f" + j;
  }
}
print(continueLog);
