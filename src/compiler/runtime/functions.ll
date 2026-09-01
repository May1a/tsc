define i64 @valueBoxFunction(ptr %function) {
entry:
  %bits = ptrtoint ptr %function to i64
  %payload = and i64 %bits, 281474976710655
  %value = or i64 %payload, 9221964661971222528
  ret i64 %value
}
define ptr @valueFunctionPtr(i64 %value) {
entry:
  %bits = and i64 %value, 281474976710655
  %ptr = inttoptr i64 %bits to ptr
  ret ptr %ptr
}
define i64 @functionObjectNew(ptr %code, ptr %env, i64 %boundThis, i64 %name.value, i64 %length) {
entry:
  %cell = call ptr @gcAlloc(i64 5, i64 56)
  %payload = getelementptr i8, ptr %cell, i64 8
  store ptr %code, ptr %payload
  %env.slot = getelementptr i8, ptr %payload, i64 8
  store ptr %env, ptr %env.slot
  %this.slot = getelementptr i8, ptr %payload, i64 16
  store i64 %boundThis, ptr %this.slot
  %prototype.slot = getelementptr i8, ptr %payload, i64 24
  store ptr null, ptr %prototype.slot
  %name.slot = getelementptr i8, ptr %payload, i64 32
  store i64 %name.value, ptr %name.slot
  %flags.slot = getelementptr i8, ptr %payload, i64 40
  store i64 0, ptr %flags.slot
  %length.slot = getelementptr i8, ptr %payload, i64 48
  store i64 %length, ptr %length.slot
  %value = call i64 @valueBoxFunction(ptr %payload)
  ret i64 %value
}
define { i64, i1 } @jsCall(i64 %fn.value, i64 %argc, ptr %argv, i64 %callThis) {
entry:
  %function = call ptr @valueFunctionPtr(i64 %fn.value)
  %code = load ptr, ptr %function
  %env.slot = getelementptr i8, ptr %function, i64 8
  %env = load ptr, ptr %env.slot
  %this.slot = getelementptr i8, ptr %function, i64 16
  %boundThis = load i64, ptr %this.slot
  %has.bound.this = icmp ne i64 %boundThis, 9222246136947933184
  %this.value = select i1 %has.bound.this, i64 %boundThis, i64 %callThis
  %result = call { i64, i1 } %code(i64 %argc, ptr %argv, ptr %env, i64 %this.value)
  ret { i64, i1 } %result
}
@.function.name.key = private unnamed_addr constant [5 x i8] c"name\00"
@.function.length.key = private unnamed_addr constant [7 x i8] c"length\00"
@.function.empty.name = private unnamed_addr constant [1 x i8] c"\00"
define i64 @functionObjectGet(i64 %value, i64 %key.len, ptr %key.ptr) {
entry:
  %function.ptr = call ptr @valueFunctionPtr(i64 %value)
  %flags.slot = getelementptr i8, ptr %function.ptr, i64 40
  %flags = load i64, ptr %flags.slot
  %is.name.length = icmp eq i64 %key.len, 4
  br i1 %is.name.length, label %name.compare, label %check.length
name.compare:
  %name.cmp = call i32 @memcmp(ptr %key.ptr, ptr @.function.name.key, i64 4)
  %is.name = icmp eq i32 %name.cmp, 0
  br i1 %is.name, label %name.load, label %missing
name.load:
  ; A deleted own name falls back to Function.prototype.name, which is "".
  %name.deleted.bit = and i64 %flags, 1
  %name.deleted = icmp ne i64 %name.deleted.bit, 0
  br i1 %name.deleted, label %name.empty, label %name.read
name.read:
  %name.slot = getelementptr i8, ptr %function.ptr, i64 32
  %name = load i64, ptr %name.slot
  %name.missing = icmp eq i64 %name, 9222246136947933184
  br i1 %name.missing, label %name.empty, label %name.found
name.empty:
  %empty.name = call i64 @valueBoxString(ptr @.function.empty.name, i64 0)
  ret i64 %empty.name
name.found:
  ret i64 %name
check.length:
  %is.length.length = icmp eq i64 %key.len, 6
  br i1 %is.length.length, label %length.compare, label %missing
length.compare:
  %length.cmp = call i32 @memcmp(ptr %key.ptr, ptr @.function.length.key, i64 6)
  %is.length = icmp eq i32 %length.cmp, 0
  br i1 %is.length, label %length.load, label %missing
length.load:
  ; A deleted own length falls back to Function.prototype.length, which is 0.
  %length.deleted.bit = and i64 %flags, 2
  %length.deleted = icmp ne i64 %length.deleted.bit, 0
  br i1 %length.deleted, label %length.zero, label %length.read
length.read:
  %length.slot = getelementptr i8, ptr %function.ptr, i64 48
  %length.i = load i64, ptr %length.slot
  %length.d = uitofp i64 %length.i to double
  %length.boxed = call i64 @valueBoxNumber(double %length.d)
  ret i64 %length.boxed
length.zero:
  %zero.boxed = call i64 @valueBoxNumber(double 0.0)
  ret i64 %zero.boxed
missing:
  ret i64 9222246136947933184
}
define i1 @functionObjectHasOwn(i64 %value, i64 %key.len, ptr %key.ptr) {
entry:
  %is.name.length = icmp eq i64 %key.len, 4
  br i1 %is.name.length, label %name.compare, label %check.length
name.compare:
  %name.cmp = call i32 @memcmp(ptr %key.ptr, ptr @.function.name.key, i64 4)
  %is.name = icmp eq i32 %name.cmp, 0
  br i1 %is.name, label %name.flags, label %missing
name.flags:
  %function.ptr = call ptr @valueFunctionPtr(i64 %value)
  %flags.slot = getelementptr i8, ptr %function.ptr, i64 40
  %flags = load i64, ptr %flags.slot
  %name.deleted.bit = and i64 %flags, 1
  %name.present = icmp eq i64 %name.deleted.bit, 0
  ret i1 %name.present
check.length:
  %is.length.length = icmp eq i64 %key.len, 6
  br i1 %is.length.length, label %length.compare, label %missing
length.compare:
  %length.cmp = call i32 @memcmp(ptr %key.ptr, ptr @.function.length.key, i64 6)
  %is.length = icmp eq i32 %length.cmp, 0
  br i1 %is.length, label %length.flags, label %missing
length.flags:
  %function.ptr.l = call ptr @valueFunctionPtr(i64 %value)
  %flags.slot.l = getelementptr i8, ptr %function.ptr.l, i64 40
  %flags.l = load i64, ptr %flags.slot.l
  %length.deleted.bit = and i64 %flags.l, 2
  %length.present = icmp eq i64 %length.deleted.bit, 0
  ret i1 %length.present
missing:
  ret i1 false
}
define void @functionObjectDelete(i64 %value, i64 %key.len, ptr %key.ptr) {
entry:
  %function.ptr = call ptr @valueFunctionPtr(i64 %value)
  %flags.slot = getelementptr i8, ptr %function.ptr, i64 40
  %is.name.length = icmp eq i64 %key.len, 4
  br i1 %is.name.length, label %name.compare, label %check.length
name.compare:
  %name.cmp = call i32 @memcmp(ptr %key.ptr, ptr @.function.name.key, i64 4)
  %is.name = icmp eq i32 %name.cmp, 0
  br i1 %is.name, label %name.delete, label %done
name.delete:
  %name.flags = load i64, ptr %flags.slot
  %name.flags.next = or i64 %name.flags, 1
  store i64 %name.flags.next, ptr %flags.slot
  ret void
check.length:
  %is.length.length = icmp eq i64 %key.len, 6
  br i1 %is.length.length, label %length.compare, label %done
length.compare:
  %length.cmp = call i32 @memcmp(ptr %key.ptr, ptr @.function.length.key, i64 6)
  %is.length = icmp eq i32 %length.cmp, 0
  br i1 %is.length, label %length.delete, label %done
length.delete:
  %length.flags = load i64, ptr %flags.slot
  %length.flags.next = or i64 %length.flags, 2
  store i64 %length.flags.next, ptr %flags.slot
  ret void
done:
  ret void
}
define i64 @functionObjectOwnPropertyDescriptor(i64 %value, i64 %key.len, ptr %key.ptr) {
entry:
  %is.name.length = icmp eq i64 %key.len, 4
  br i1 %is.name.length, label %name.compare, label %check.length
name.compare:
  %name.cmp = call i32 @memcmp(ptr %key.ptr, ptr @.function.name.key, i64 4)
  %is.name = icmp eq i32 %name.cmp, 0
  br i1 %is.name, label %name.flags, label %missing
name.flags:
  %function.ptr = call ptr @valueFunctionPtr(i64 %value)
  %flags.slot = getelementptr i8, ptr %function.ptr, i64 40
  %flags = load i64, ptr %flags.slot
  %name.deleted.bit = and i64 %flags, 1
  %name.deleted = icmp ne i64 %name.deleted.bit, 0
  br i1 %name.deleted, label %missing, label %name.value
name.value:
  %name.slot = getelementptr i8, ptr %function.ptr, i64 32
  %name.stored = load i64, ptr %name.slot
  %name.missing = icmp eq i64 %name.stored, 9222246136947933184
  br i1 %name.missing, label %name.empty, label %name.describe
name.empty:
  %name.empty.value = call i64 @valueBoxString(ptr @.function.empty.name, i64 0)
  br label %name.describe
name.describe:
  %name.value.final = phi i64 [ %name.stored, %name.value ], [ %name.empty.value, %name.empty ]
  %name.desc = call ptr @objectNew(i64 4)
  call void @objectSet(ptr %name.desc, i64 5, ptr @.desc.value, i64 %name.value.final)
  call void @objectSet(ptr %name.desc, i64 8, ptr @.desc.writable, i64 9222246136947933185)
  call void @objectSet(ptr %name.desc, i64 10, ptr @.desc.enumerable, i64 9222246136947933185)
  call void @objectSet(ptr %name.desc, i64 12, ptr @.desc.configurable, i64 9222246136947933186)
  %name.boxed = call i64 @valueBoxObject(ptr %name.desc)
  ret i64 %name.boxed
check.length:
  %is.length.length = icmp eq i64 %key.len, 6
  br i1 %is.length.length, label %length.compare, label %missing
length.compare:
  %length.cmp = call i32 @memcmp(ptr %key.ptr, ptr @.function.length.key, i64 6)
  %is.length = icmp eq i32 %length.cmp, 0
  br i1 %is.length, label %length.flags, label %missing
length.flags:
  %function.ptr.l = call ptr @valueFunctionPtr(i64 %value)
  %flags.slot.l = getelementptr i8, ptr %function.ptr.l, i64 40
  %flags.l = load i64, ptr %flags.slot.l
  %length.deleted.bit = and i64 %flags.l, 2
  %length.deleted = icmp ne i64 %length.deleted.bit, 0
  br i1 %length.deleted, label %missing, label %length.value
length.value:
  %length.slot = getelementptr i8, ptr %function.ptr.l, i64 48
  %length.i = load i64, ptr %length.slot
  %length.d = uitofp i64 %length.i to double
  %length.boxed = call i64 @valueBoxNumber(double %length.d)
  %length.desc = call ptr @objectNew(i64 4)
  call void @objectSet(ptr %length.desc, i64 5, ptr @.desc.value, i64 %length.boxed)
  call void @objectSet(ptr %length.desc, i64 8, ptr @.desc.writable, i64 9222246136947933185)
  call void @objectSet(ptr %length.desc, i64 10, ptr @.desc.enumerable, i64 9222246136947933185)
  call void @objectSet(ptr %length.desc, i64 12, ptr @.desc.configurable, i64 9222246136947933186)
  %length.desc.boxed = call i64 @valueBoxObject(ptr %length.desc)
  ret i64 %length.desc.boxed
missing:
  ret i64 9222246136947933184
}
