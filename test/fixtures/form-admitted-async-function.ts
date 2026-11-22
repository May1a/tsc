async function addLater(a: number, b: number): Promise<number> {
  const x = await Promise.resolve(a);
  const y = await Promise.resolve(b);
  return x + y;
}

async function failing(): Promise<number> {
  throw "boom";
}

async function recover(): Promise<string> {
  let trace = "";
  try {
    trace = trace + "try-";
    await failing();
    trace = trace + "unreachable-";
  } catch (e) {
    trace = trace + "caught:" + String(e) + "-";
  } finally {
    trace = trace + "fin";
  }
  return trace;
}

const arrowAsync = async (n: number): Promise<number> => (await Promise.resolve(n)) * 3;

class Service {
  factor: number;
  constructor(factor: number) {
    this.factor = factor;
  }
  async scale(n: number): Promise<number> {
    const v = await Promise.resolve(n);
    return v * this.factor;
  }
  static async id(x: string): Promise<string> {
    return await Promise.resolve(x);
  }
}

const obj = {
  prefix: "hi:",
  async greet(name: string): Promise<string> {
    const s = await Promise.resolve(name);
    return this.prefix + s;
  }
};

async function main(): Promise<void> {
  console.log("start");
  const sum = await addLater(10, 32);
  console.log("sum:" + String(sum));
  const rec = await recover();
  console.log("rec:" + rec);
  console.log("arrow:" + String(await arrowAsync(7)));
  const svc = new Service(4);
  console.log("method:" + String(await svc.scale(5)));
  console.log("static:" + (await Service.id("ok")));
  console.log("obj:" + (await obj.greet("world")));
}

main();
console.log("sync-end");
