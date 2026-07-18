// @ts-nocheck
function Factory(this: { value: number }): void {
  this.value = 7;
}

new Factory();
