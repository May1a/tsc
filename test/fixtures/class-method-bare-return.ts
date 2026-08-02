declare function print(value: unknown): void;

class Logger {
  log(x: number) {
    if (x > 0) {
      print("positive");
      return;
    }
    print("not positive");
  }
}

const logger = new Logger();
print(logger.log(1));
print(logger.log(-1));
