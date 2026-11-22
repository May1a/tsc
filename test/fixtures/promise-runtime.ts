const p1 = new Promise<number>((resolve) => {
  resolve(10);
});

p1.then((v) => v + 5)
  .then((v) => {
    console.log("chain:" + String(v));
  });

const p2 = new Promise<number>((_resolve, reject) => {
  reject("bad");
});

p2.catch((e) => {
  console.log("caught:" + String(e));
  return 99;
}).finally(() => {
  console.log("finally-ran");
}).then((v) => {
  console.log("after-finally:" + String(v));
});

Promise.all([Promise.resolve(1), 2, Promise.resolve(3)]).then((arr) => {
  console.log("all:" + arr.join(","));
});

Promise.race([Promise.resolve("first"), Promise.resolve("second")]).then((v) => {
  console.log("race:" + String(v));
});

Promise.allSettled([Promise.resolve("ok"), Promise.reject("no")]).then((res) => {
  const first = res[0];
  const second = res[1];
  const v0 = first.status === "fulfilled" ? first.value : "";
  const r1 = second.status === "rejected" ? second.reason : "";
  console.log("settled:" + first.status + ":" + String(v0) + "|" + second.status + ":" + String(r1));
});

Promise.any([Promise.reject("e1"), Promise.resolve("win"), Promise.reject("e2")]).then((v) => {
  console.log("any:" + String(v));
});

console.log("sync");
