; Promise runtime, FIFO microtask queue, and async state-machine driver.
; All state lives in GC-traced objects, arrays, and environments (zero custom GC tags).

@.promise.key.s = private unnamed_addr constant [2 x i8] c"s\00"
@.promise.key.v = private unnamed_addr constant [2 x i8] c"v\00"
@.promise.key.r = private unnamed_addr constant [2 x i8] c"r\00"
@.promise.key.then = private unnamed_addr constant [5 x i8] c"then\00"
@.promise.key.catch = private unnamed_addr constant [6 x i8] c"catch\00"
@.promise.key.finally = private unnamed_addr constant [8 x i8] c"finally\00"
@.promise.key.status = private unnamed_addr constant [7 x i8] c"status\00"
@.promise.key.value = private unnamed_addr constant [6 x i8] c"value\00"
@.promise.key.reason = private unnamed_addr constant [7 x i8] c"reason\00"
@.promise.str.fulfilled = private unnamed_addr constant [10 x i8] c"fulfilled\00"
@.promise.str.rejected = private unnamed_addr constant [9 x i8] c"rejected\00"
@.promise.err.executor = private unnamed_addr constant [35 x i8] c"Promise resolver is not a function\00"
@.promise.err.cycle = private unnamed_addr constant [36 x i8] c"Chaining cycle detected for promise\00"
@.promise.err.not.promise = private unnamed_addr constant [47 x i8] c"Promise.prototype method called on non-Promise\00"
@.promise.err.all.rejected = private unnamed_addr constant [27 x i8] c"All promises were rejected\00"
@.promise.err.not.iterable = private unnamed_addr constant [25 x i8] c"Argument is not iterable\00"
@.promise.err.aggregate = private unnamed_addr constant [15 x i8] c"AggregateError\00"

@microtaskQueueValue = private global i64 0
@microtaskHead = private global i64 0
@promisePrototypeValue = private global i64 0

define void @microtaskEnqueue(i64 %thunk) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %thunk)
  %cached = load i64, ptr @microtaskQueueValue
  %ready = icmp ne i64 %cached, 0
  br i1 %ready, label %push, label %init
init:
  %arr = call ptr @arrayNew(i64 0)
  %boxed = call i64 @valueBoxArray(ptr %arr)
  store i64 %boxed, ptr @microtaskQueueValue
  call void @gcRegisterGlobalRoot(ptr @microtaskQueueValue)
  br label %push
push:
  %qval = phi i64 [ %cached, %entry ], [ %boxed, %init ]
  %qptr = call ptr @valueArrayPtr(i64 %qval)
  call i64 @arrayPush(ptr %qptr, i64 %thunk)
  call void @gcRootRestore(i64 %frame)
  ret void
}

define void @microtaskDrain() {
entry:
  %cached = load i64, ptr @microtaskQueueValue
  %empty = icmp eq i64 %cached, 0
  br i1 %empty, label %done, label %loop
loop:
  %qval = load i64, ptr @microtaskQueueValue
  %qptr = call ptr @valueArrayPtr(i64 %qval)
  %len = call i64 @arrayLength(ptr %qptr)
  %head = load i64, ptr @microtaskHead
  %has.more = icmp ult i64 %head, %len
  br i1 %has.more, label %run, label %reset
run:
  %frame = call i64 @gcRootSave()
  %thunk = call i64 @arrayGet(ptr %qptr, i64 %head)
  call void @gcRootPush(i64 %thunk)
  call void @arraySet(ptr %qptr, i64 %head, i64 9222246136947933184)
  %next.head = add i64 %head, 1
  store i64 %next.head, ptr @microtaskHead
  call { i64, i1 } @jsCall(i64 %thunk, i64 0, ptr null, i64 9222246136947933184)
  call void @gcRootRestore(i64 %frame)
  br label %loop
reset:
  store i64 0, ptr @microtaskHead
  call void @arraySetLength(ptr %qptr, i64 0)
  br label %done
done:
  ret void
}

define ptr @promisePrivateTable(i64 %value) {
entry:
  %is.obj = call i1 @valueIsPlainObject(i64 %value)
  br i1 %is.obj, label %check.priv, label %not.promise
check.priv:
  %obj = call ptr @valueObjectPtr(i64 %value)
  %priv.slot = getelementptr i8, ptr %obj, i64 56
  %priv = load ptr, ptr %priv.slot
  %has.priv = icmp ne ptr %priv, null
  br i1 %has.priv, label %check.key, label %not.promise
check.key:
  %has.s = call i1 @objectHasOwn(ptr %priv, i64 1, ptr @.promise.key.s)
  br i1 %has.s, label %found, label %not.promise
found:
  ret ptr %priv
not.promise:
  ret ptr null
}

define i64 @promiseState(ptr %priv) {
entry:
  %s.val = call i64 @objectGet(ptr %priv, i64 1, ptr @.promise.key.s)
  %s.num = call double @valueToNumber(i64 %s.val)
  %s.int = fptosi double %s.num to i64
  ret i64 %s.int
}

define ptr @promisePrototype() {
entry:
  %cached = load i64, ptr @promisePrototypeValue
  %ready = icmp ne i64 %cached, 0
  br i1 %ready, label %reuse, label %create
reuse:
  %ptr = call ptr @valueObjectPtr(i64 %cached)
  ret ptr %ptr
create:
  %frame = call i64 @gcRootSave()
  %proto = call ptr @objectNew(i64 3)
  %boxed = call i64 @valueBoxObject(ptr %proto)
  call void @gcRootPush(i64 %boxed)
  %then.name = call i64 @valueBoxString(ptr @.promise.key.then, i64 4)
  call void @gcRootPush(i64 %then.name)
  %then.fn = call i64 @functionObjectNew(ptr @promiseThenMethod, ptr null, i64 9222246136947933184, i64 %then.name, i64 2)
  call void @gcRootPush(i64 %then.fn)
  call void @objectDefineDataProperty(ptr %proto, i64 4, ptr @.promise.key.then, i64 %then.fn, i64 5)
  %catch.name = call i64 @valueBoxString(ptr @.promise.key.catch, i64 5)
  call void @gcRootPush(i64 %catch.name)
  %catch.fn = call i64 @functionObjectNew(ptr @promiseCatchMethod, ptr null, i64 9222246136947933184, i64 %catch.name, i64 1)
  call void @gcRootPush(i64 %catch.fn)
  call void @objectDefineDataProperty(ptr %proto, i64 5, ptr @.promise.key.catch, i64 %catch.fn, i64 5)
  %fin.name = call i64 @valueBoxString(ptr @.promise.key.finally, i64 7)
  call void @gcRootPush(i64 %fin.name)
  %fin.fn = call i64 @functionObjectNew(ptr @promiseFinallyMethod, ptr null, i64 9222246136947933184, i64 %fin.name, i64 1)
  call void @gcRootPush(i64 %fin.fn)
  call void @objectDefineDataProperty(ptr %proto, i64 7, ptr @.promise.key.finally, i64 %fin.fn, i64 5)
  store i64 %boxed, ptr @promisePrototypeValue
  call void @gcRegisterGlobalRoot(ptr @promisePrototypeValue)
  call void @gcRootRestore(i64 %frame)
  ret ptr %proto
}

define i64 @promiseCreate() {
entry:
  %frame = call i64 @gcRootSave()
  %proto = call ptr @promisePrototype()
  %proto.boxed = call i64 @valueBoxObject(ptr %proto)
  call void @gcRootPush(i64 %proto.boxed)
  %obj = call ptr @objectNew(i64 0)
  %obj.boxed = call i64 @valueBoxObject(ptr %obj)
  call void @gcRootPush(i64 %obj.boxed)
  call void @objectSetPrototype(ptr %obj, ptr %proto)
  %priv = call ptr @objectNew(i64 3)
  %priv.boxed = call i64 @valueBoxObject(ptr %priv)
  call void @gcRootPush(i64 %priv.boxed)
  %zero = call i64 @valueBoxNumber(double 0.0)
  call void @objectSet(ptr %priv, i64 1, ptr @.promise.key.s, i64 %zero)
  call void @objectSet(ptr %priv, i64 1, ptr @.promise.key.v, i64 9222246136947933184)
  %reactions = call ptr @arrayNew(i64 0)
  %reactions.boxed = call i64 @valueBoxArray(ptr %reactions)
  call void @gcRootPush(i64 %reactions.boxed)
  call void @objectSet(ptr %priv, i64 1, ptr @.promise.key.r, i64 %reactions.boxed)
  %priv.slot = getelementptr i8, ptr %obj, i64 56
  store ptr %priv, ptr %priv.slot
  call void @gcRootRestore(i64 %frame)
  ret i64 %obj.boxed
}

; Reaction env slots: [0]=childPromise, [1]=onFulfilled, [2]=onRejected, [3]=settledState(1|2), [4]=settledValue
define { i64, i1 } @promiseReactionJob(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %frame = call i64 @gcRootSave()
  %child = call i64 @environmentGet(ptr %env, i64 0)
  %on.ful = call i64 @environmentGet(ptr %env, i64 1)
  %on.rej = call i64 @environmentGet(ptr %env, i64 2)
  %state.box = call i64 @environmentGet(ptr %env, i64 3)
  %val = call i64 @environmentGet(ptr %env, i64 4)
  call void @gcRootPush(i64 %child)
  call void @gcRootPush(i64 %on.ful)
  call void @gcRootPush(i64 %on.rej)
  call void @gcRootPush(i64 %val)
  %state.num = call double @valueToNumber(i64 %state.box)
  %is.ful = fcmp oeq double %state.num, 1.0
  %handler = select i1 %is.ful, i64 %on.ful, i64 %on.rej
  %callable = call i1 @valueIsFunction(i64 %handler)
  br i1 %callable, label %call.handler, label %passthrough
call.handler:
  %arg.buf = alloca i64
  store i64 %val, ptr %arg.buf
  %res = call { i64, i1 } @jsCall(i64 %handler, i64 1, ptr %arg.buf, i64 9222246136947933184)
  %res.val = extractvalue { i64, i1 } %res, 0
  %res.threw = extractvalue { i64, i1 } %res, 1
  call void @gcRootPush(i64 %res.val)
  br i1 %res.threw, label %reject.child, label %resolve.child
resolve.child:
  call void @promiseResolve(i64 %child, i64 %res.val)
  br label %done
reject.child:
  call void @promiseReject(i64 %child, i64 %res.val)
  br label %done
passthrough:
  br i1 %is.ful, label %pass.ful, label %pass.rej
pass.ful:
  call void @promiseResolve(i64 %child, i64 %val)
  br label %done
pass.rej:
  call void @promiseReject(i64 %child, i64 %val)
  br label %done
done:
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } { i64 9222246136947933184, i1 false }
}

define void @promiseEnqueueReaction(i64 %child, i64 %on.ful, i64 %on.rej, double %state.num, i64 %val) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %child)
  call void @gcRootPush(i64 %on.ful)
  call void @gcRootPush(i64 %on.rej)
  call void @gcRootPush(i64 %val)
  %env = call ptr @environmentNew(i64 5)
  %env.boxed = call i64 @valueBoxObject(ptr %env)
  call void @gcRootPush(i64 %env.boxed)
  %state.box = call i64 @valueBoxNumber(double %state.num)
  call void @environmentSet(ptr %env, i64 0, i64 %child)
  call void @environmentSet(ptr %env, i64 1, i64 %on.ful)
  call void @environmentSet(ptr %env, i64 2, i64 %on.rej)
  call void @environmentSet(ptr %env, i64 3, i64 %state.box)
  call void @environmentSet(ptr %env, i64 4, i64 %val)
  %job = call i64 @functionObjectNew(ptr @promiseReactionJob, ptr %env, i64 9222246136947933184, i64 9222246136947933184, i64 0)
  call void @gcRootPush(i64 %job)
  call void @microtaskEnqueue(i64 %job)
  call void @gcRootRestore(i64 %frame)
  ret void
}

define void @promiseSettleDirect(i64 %promise, double %state.num, i64 %val) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %promise)
  call void @gcRootPush(i64 %val)
  %priv = call ptr @promisePrivateTable(i64 %promise)
  %no.priv = icmp eq ptr %priv, null
  br i1 %no.priv, label %done, label %check.pending
check.pending:
  %cur = call i64 @promiseState(ptr %priv)
  %pending = icmp eq i64 %cur, 0
  br i1 %pending, label %settle, label %done
settle:
  %state.box = call i64 @valueBoxNumber(double %state.num)
  call void @objectSet(ptr %priv, i64 1, ptr @.promise.key.s, i64 %state.box)
  call void @objectSet(ptr %priv, i64 1, ptr @.promise.key.v, i64 %val)
  %r.box = call i64 @objectGet(ptr %priv, i64 1, ptr @.promise.key.r)
  call void @gcRootPush(i64 %r.box)
  %empty.r = call ptr @arrayNew(i64 0)
  %empty.r.box = call i64 @valueBoxArray(ptr %empty.r)
  call void @objectSet(ptr %priv, i64 1, ptr @.promise.key.r, i64 %empty.r.box)
  %r.arr = call ptr @valueArrayPtr(i64 %r.box)
  %r.len = call i64 @arrayLength(ptr %r.arr)
  br label %loop
loop:
  %i = phi i64 [ 0, %settle ], [ %next, %body ]
  %finished = icmp uge i64 %i, %r.len
  br i1 %finished, label %done, label %body
body:
  %rec.val = call i64 @arrayGet(ptr %r.arr, i64 %i)
  %rec.arr = call ptr @valueArrayPtr(i64 %rec.val)
  %child = call i64 @arrayGet(ptr %rec.arr, i64 0)
  %on.ful = call i64 @arrayGet(ptr %rec.arr, i64 1)
  %on.rej = call i64 @arrayGet(ptr %rec.arr, i64 2)
  call void @promiseEnqueueReaction(i64 %child, i64 %on.ful, i64 %on.rej, double %state.num, i64 %val)
  %next = add i64 %i, 1
  br label %loop
done:
  call void @gcRootRestore(i64 %frame)
  ret void
}

define void @promiseReject(i64 %promise, i64 %reason) {
entry:
  call void @promiseSettleDirect(i64 %promise, double 2.0, i64 %reason)
  ret void
}

; One-shot guarded resolver/rejector: env = [0]=promise, [1]=guardArray([0]=calledBool)
define { i64, i1 } @promiseResolveFn(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %frame = call i64 @gcRootSave()
  %promise = call i64 @environmentGet(ptr %env, i64 0)
  %guard.box = call i64 @environmentGet(ptr %env, i64 1)
  call void @gcRootPush(i64 %promise)
  call void @gcRootPush(i64 %guard.box)
  %guard = call ptr @valueArrayPtr(i64 %guard.box)
  %already = call i64 @arrayGet(ptr %guard, i64 0)
  %is.called = icmp ne i64 %already, 9222246136947933185
  br i1 %is.called, label %done, label %fire
fire:
  call void @arraySet(ptr %guard, i64 0, i64 9222246136947933186)
  %has.arg = icmp uge i64 %argc, 1
  br i1 %has.arg, label %load, label %undef
load:
  %arg = load i64, ptr %argv
  br label %resolve
undef:
  br label %resolve
resolve:
  %val = phi i64 [ %arg, %load ], [ 9222246136947933184, %undef ]
  call void @promiseResolve(i64 %promise, i64 %val)
  br label %done
done:
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } { i64 9222246136947933184, i1 false }
}

define { i64, i1 } @promiseRejectFn(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %frame = call i64 @gcRootSave()
  %promise = call i64 @environmentGet(ptr %env, i64 0)
  %guard.box = call i64 @environmentGet(ptr %env, i64 1)
  call void @gcRootPush(i64 %promise)
  call void @gcRootPush(i64 %guard.box)
  %guard = call ptr @valueArrayPtr(i64 %guard.box)
  %already = call i64 @arrayGet(ptr %guard, i64 0)
  %is.called = icmp ne i64 %already, 9222246136947933185
  br i1 %is.called, label %done, label %fire
fire:
  call void @arraySet(ptr %guard, i64 0, i64 9222246136947933186)
  %has.arg = icmp uge i64 %argc, 1
  br i1 %has.arg, label %load, label %undef
load:
  %arg = load i64, ptr %argv
  br label %reject
undef:
  br label %reject
reject:
  %val = phi i64 [ %arg, %load ], [ 9222246136947933184, %undef ]
  call void @promiseReject(i64 %promise, i64 %val)
  br label %done
done:
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } { i64 9222246136947933184, i1 false }
}

define { i64, i64 } @promiseCreateResolvingFunctions(i64 %promise) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %promise)
  %guard = call ptr @arrayNew(i64 1)
  %guard.box = call i64 @valueBoxArray(ptr %guard)
  call void @gcRootPush(i64 %guard.box)
  call void @arraySet(ptr %guard, i64 0, i64 9222246136947933185)
  %env = call ptr @environmentNew(i64 2)
  %env.box = call i64 @valueBoxObject(ptr %env)
  call void @gcRootPush(i64 %env.box)
  call void @environmentSet(ptr %env, i64 0, i64 %promise)
  call void @environmentSet(ptr %env, i64 1, i64 %guard.box)
  %res.fn = call i64 @functionObjectNew(ptr @promiseResolveFn, ptr %env, i64 9222246136947933184, i64 9222246136947933184, i64 1)
  call void @gcRootPush(i64 %res.fn)
  %rej.fn = call i64 @functionObjectNew(ptr @promiseRejectFn, ptr %env, i64 9222246136947933184, i64 9222246136947933184, i64 1)
  call void @gcRootPush(i64 %rej.fn)
  %p0 = insertvalue { i64, i64 } undef, i64 %res.fn, 0
  %p1 = insertvalue { i64, i64 } %p0, i64 %rej.fn, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i64 } %p1
}

; Thenable adoption job: env = [0]=promise, [1]=thenable, [2]=thenFn
define { i64, i1 } @promiseAdoptThenableJob(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %frame = call i64 @gcRootSave()
  %promise = call i64 @environmentGet(ptr %env, i64 0)
  %thenable = call i64 @environmentGet(ptr %env, i64 1)
  %then.fn = call i64 @environmentGet(ptr %env, i64 2)
  call void @gcRootPush(i64 %promise)
  call void @gcRootPush(i64 %thenable)
  call void @gcRootPush(i64 %then.fn)
  %pair = call { i64, i64 } @promiseCreateResolvingFunctions(i64 %promise)
  %res.fn = extractvalue { i64, i64 } %pair, 0
  %rej.fn = extractvalue { i64, i64 } %pair, 1
  call void @gcRootPush(i64 %res.fn)
  call void @gcRootPush(i64 %rej.fn)
  %call.argv = alloca [2 x i64]
  %s0 = getelementptr [2 x i64], ptr %call.argv, i64 0, i64 0
  %s1 = getelementptr [2 x i64], ptr %call.argv, i64 0, i64 1
  store i64 %res.fn, ptr %s0
  store i64 %rej.fn, ptr %s1
  %call = call { i64, i1 } @jsCall(i64 %then.fn, i64 2, ptr %call.argv, i64 %thenable)
  %threw = extractvalue { i64, i1 } %call, 1
  br i1 %threw, label %on.throw, label %done
on.throw:
  %err = extractvalue { i64, i1 } %call, 0
  %rej.argv = alloca i64
  store i64 %err, ptr %rej.argv
  call { i64, i1 } @jsCall(i64 %rej.fn, i64 1, ptr %rej.argv, i64 9222246136947933184)
  br label %done
done:
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } { i64 9222246136947933184, i1 false }
}

define void @promiseResolve(i64 %promise, i64 %value) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %promise)
  call void @gcRootPush(i64 %value)
  %priv = call ptr @promisePrivateTable(i64 %promise)
  %no.priv = icmp eq ptr %priv, null
  br i1 %no.priv, label %done, label %check.pending
check.pending:
  %cur = call i64 @promiseState(ptr %priv)
  %pending = icmp eq i64 %cur, 0
  br i1 %pending, label %check.cycle, label %done
check.cycle:
  %same = icmp eq i64 %promise, %value
  br i1 %same, label %cycle.err, label %check.thenable
cycle.err:
  %msg = call i64 @valueBoxString(ptr @.promise.err.cycle, i64 35)
  %err.res = call { i64, i1 } @iteratorTypeError(i64 %msg)
  %err.val = extractvalue { i64, i1 } %err.res, 0
  call void @promiseReject(i64 %promise, i64 %err.val)
  br label %done
check.thenable:
  %is.obj = call i1 @valueIsObject(i64 %value)
  %is.fn = call i1 @valueIsFunction(i64 %value)
  %maybe = or i1 %is.obj, %is.fn
  br i1 %maybe, label %read.then, label %fulfill
read.then:
  %then.res = call { i64, i1 } @checkedValuePropertyGet(i64 %value, i64 4, ptr @.promise.key.then)
  %then.threw = extractvalue { i64, i1 } %then.res, 1
  br i1 %then.threw, label %then.err, label %check.then.fn
then.err:
  %get.err = extractvalue { i64, i1 } %then.res, 0
  call void @promiseReject(i64 %promise, i64 %get.err)
  br label %done
check.then.fn:
  %then.fn = extractvalue { i64, i1 } %then.res, 0
  call void @gcRootPush(i64 %then.fn)
  %then.callable = call i1 @valueIsFunction(i64 %then.fn)
  br i1 %then.callable, label %adopt, label %fulfill
adopt:
  %env = call ptr @environmentNew(i64 3)
  %env.box = call i64 @valueBoxObject(ptr %env)
  call void @gcRootPush(i64 %env.box)
  call void @environmentSet(ptr %env, i64 0, i64 %promise)
  call void @environmentSet(ptr %env, i64 1, i64 %value)
  call void @environmentSet(ptr %env, i64 2, i64 %then.fn)
  %job = call i64 @functionObjectNew(ptr @promiseAdoptThenableJob, ptr %env, i64 9222246136947933184, i64 9222246136947933184, i64 0)
  call void @gcRootPush(i64 %job)
  call void @microtaskEnqueue(i64 %job)
  br label %done
fulfill:
  call void @promiseSettleDirect(i64 %promise, double 1.0, i64 %value)
  br label %done
done:
  call void @gcRootRestore(i64 %frame)
  ret void
}

define { i64, i1 } @promiseNew(i64 %executor) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %executor)
  %callable = call i1 @valueIsFunction(i64 %executor)
  br i1 %callable, label %create, label %bad.exec
bad.exec:
  %msg = call i64 @valueBoxString(ptr @.promise.err.executor, i64 34)
  %err = call { i64, i1 } @iteratorTypeError(i64 %msg)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %err
create:
  %promise = call i64 @promiseCreate()
  call void @gcRootPush(i64 %promise)
  %pair = call { i64, i64 } @promiseCreateResolvingFunctions(i64 %promise)
  %res.fn = extractvalue { i64, i64 } %pair, 0
  %rej.fn = extractvalue { i64, i64 } %pair, 1
  call void @gcRootPush(i64 %res.fn)
  call void @gcRootPush(i64 %rej.fn)
  %argv = alloca [2 x i64]
  %s0 = getelementptr [2 x i64], ptr %argv, i64 0, i64 0
  %s1 = getelementptr [2 x i64], ptr %argv, i64 0, i64 1
  store i64 %res.fn, ptr %s0
  store i64 %rej.fn, ptr %s1
  %call = call { i64, i1 } @jsCall(i64 %executor, i64 2, ptr %argv, i64 9222246136947933184)
  %threw = extractvalue { i64, i1 } %call, 1
  br i1 %threw, label %on.throw, label %ok
on.throw:
  %thrown = extractvalue { i64, i1 } %call, 0
  %rej.argv = alloca i64
  store i64 %thrown, ptr %rej.argv
  call { i64, i1 } @jsCall(i64 %rej.fn, i64 1, ptr %rej.argv, i64 9222246136947933184)
  br label %ok
ok:
  %r0 = insertvalue { i64, i1 } undef, i64 %promise, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %r1
}

define i64 @promiseThenAttach(i64 %promise, i64 %on.ful, i64 %on.rej) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %promise)
  call void @gcRootPush(i64 %on.ful)
  call void @gcRootPush(i64 %on.rej)
  %child = call i64 @promiseCreate()
  call void @gcRootPush(i64 %child)
  %priv = call ptr @promisePrivateTable(i64 %promise)
  %state = call i64 @promiseState(ptr %priv)
  %is.pending = icmp eq i64 %state, 0
  br i1 %is.pending, label %queue, label %already
queue:
  %rec = call ptr @arrayNew(i64 3)
  %rec.box = call i64 @valueBoxArray(ptr %rec)
  call void @gcRootPush(i64 %rec.box)
  call void @arraySet(ptr %rec, i64 0, i64 %child)
  call void @arraySet(ptr %rec, i64 1, i64 %on.ful)
  call void @arraySet(ptr %rec, i64 2, i64 %on.rej)
  %r.box = call i64 @objectGet(ptr %priv, i64 1, ptr @.promise.key.r)
  %r.arr = call ptr @valueArrayPtr(i64 %r.box)
  call i64 @arrayPush(ptr %r.arr, i64 %rec.box)
  br label %done
already:
  %val = call i64 @objectGet(ptr %priv, i64 1, ptr @.promise.key.v)
  %state.d = sitofp i64 %state to double
  call void @promiseEnqueueReaction(i64 %child, i64 %on.ful, i64 %on.rej, double %state.d, i64 %val)
  br label %done
done:
  call void @gcRootRestore(i64 %frame)
  ret i64 %child
}

define { i64, i1 } @promiseThenMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %this.value)
  %priv = call ptr @promisePrivateTable(i64 %this.value)
  %no.priv = icmp eq ptr %priv, null
  br i1 %no.priv, label %not.promise, label %attach
not.promise:
  %msg = call i64 @valueBoxString(ptr @.promise.err.not.promise, i64 46)
  %err = call { i64, i1 } @iteratorTypeError(i64 %msg)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %err
attach:
  %on.ful = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %on.rej = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 1)
  %child = call i64 @promiseThenAttach(i64 %this.value, i64 %on.ful, i64 %on.rej)
  %r0 = insertvalue { i64, i1 } undef, i64 %child, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %r1
}

define { i64, i1 } @promiseCatchMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %on.rej = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %args = alloca [2 x i64]
  %s0 = getelementptr [2 x i64], ptr %args, i64 0, i64 0
  %s1 = getelementptr [2 x i64], ptr %args, i64 0, i64 1
  store i64 9222246136947933184, ptr %s0
  store i64 %on.rej, ptr %s1
  %res = call { i64, i1 } @promiseThenMethod(i64 2, ptr %args, ptr %env, i64 %this.value)
  ret { i64, i1 } %res
}

; Finally wrappers: env=[0]=savedVal, [1]=isReject(bool)
define { i64, i1 } @promiseFinallyPassThunk(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %saved = call i64 @environmentGet(ptr %env, i64 0)
  %is.rej = call i64 @environmentGet(ptr %env, i64 1)
  %threw = icmp eq i64 %is.rej, 9222246136947933186
  %r0 = insertvalue { i64, i1 } undef, i64 %saved, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 %threw, 1
  ret { i64, i1 } %r1
}

; env=[0]=onFinally, [1]=isReject(bool)
define { i64, i1 } @promiseFinallyHandler(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %frame = call i64 @gcRootSave()
  %on.fin = call i64 @environmentGet(ptr %env, i64 0)
  %is.rej = call i64 @environmentGet(ptr %env, i64 1)
  %orig = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  call void @gcRootPush(i64 %on.fin)
  call void @gcRootPush(i64 %orig)
  %call = call { i64, i1 } @jsCall(i64 %on.fin, i64 0, ptr null, i64 9222246136947933184)
  %call.val = extractvalue { i64, i1 } %call, 0
  %call.threw = extractvalue { i64, i1 } %call, 1
  call void @gcRootPush(i64 %call.val)
  br i1 %call.threw, label %fail, label %wait
fail:
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %call
wait:
  %awaited = call i64 @promiseResolveStatic(i64 %call.val)
  call void @gcRootPush(i64 %awaited)
  %penv = call ptr @environmentNew(i64 2)
  %penv.box = call i64 @valueBoxObject(ptr %penv)
  call void @gcRootPush(i64 %penv.box)
  call void @environmentSet(ptr %penv, i64 0, i64 %orig)
  call void @environmentSet(ptr %penv, i64 1, i64 %is.rej)
  %thunk = call i64 @functionObjectNew(ptr @promiseFinallyPassThunk, ptr %penv, i64 9222246136947933184, i64 9222246136947933184, i64 0)
  call void @gcRootPush(i64 %thunk)
  %chained = call i64 @promiseThenAttach(i64 %awaited, i64 %thunk, i64 9222246136947933184)
  %r0 = insertvalue { i64, i1 } undef, i64 %chained, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %r1
}

define { i64, i1 } @promiseFinallyMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %this.value)
  %priv = call ptr @promisePrivateTable(i64 %this.value)
  %no.priv = icmp eq ptr %priv, null
  br i1 %no.priv, label %not.promise, label %check.fn
not.promise:
  %msg = call i64 @valueBoxString(ptr @.promise.err.not.promise, i64 46)
  %err = call { i64, i1 } @iteratorTypeError(i64 %msg)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %err
check.fn:
  %on.fin = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  call void @gcRootPush(i64 %on.fin)
  %callable = call i1 @valueIsFunction(i64 %on.fin)
  br i1 %callable, label %wrap, label %passthrough
passthrough:
  %same = call i64 @promiseThenAttach(i64 %this.value, i64 %on.fin, i64 %on.fin)
  %p0 = insertvalue { i64, i1 } undef, i64 %same, 0
  %p1 = insertvalue { i64, i1 } %p0, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %p1
wrap:
  %fenv = call ptr @environmentNew(i64 2)
  %fenv.box = call i64 @valueBoxObject(ptr %fenv)
  call void @gcRootPush(i64 %fenv.box)
  call void @environmentSet(ptr %fenv, i64 0, i64 %on.fin)
  call void @environmentSet(ptr %fenv, i64 1, i64 9222246136947933185)
  %ful.h = call i64 @functionObjectNew(ptr @promiseFinallyHandler, ptr %fenv, i64 9222246136947933184, i64 9222246136947933184, i64 1)
  call void @gcRootPush(i64 %ful.h)
  %renv = call ptr @environmentNew(i64 2)
  %renv.box = call i64 @valueBoxObject(ptr %renv)
  call void @gcRootPush(i64 %renv.box)
  call void @environmentSet(ptr %renv, i64 0, i64 %on.fin)
  call void @environmentSet(ptr %renv, i64 1, i64 9222246136947933186)
  %rej.h = call i64 @functionObjectNew(ptr @promiseFinallyHandler, ptr %renv, i64 9222246136947933184, i64 9222246136947933184, i64 1)
  call void @gcRootPush(i64 %rej.h)
  %child = call i64 @promiseThenAttach(i64 %this.value, i64 %ful.h, i64 %rej.h)
  %r0 = insertvalue { i64, i1 } undef, i64 %child, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %r1
}

define i64 @promiseResolveStatic(i64 %value) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %value)
  %priv = call ptr @promisePrivateTable(i64 %value)
  %is.promise = icmp ne ptr %priv, null
  br i1 %is.promise, label %already, label %create
already:
  call void @gcRootRestore(i64 %frame)
  ret i64 %value
create:
  %p = call i64 @promiseCreate()
  call void @gcRootPush(i64 %p)
  call void @promiseResolve(i64 %p, i64 %value)
  call void @gcRootRestore(i64 %frame)
  ret i64 %p
}

define i64 @promiseRejectStatic(i64 %reason) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %reason)
  %p = call i64 @promiseCreate()
  call void @gcRootPush(i64 %p)
  call void @promiseReject(i64 %p, i64 %reason)
  call void @gcRootRestore(i64 %frame)
  ret i64 %p
}

; Collect an iterable into a boxed runtime array, or return { err, true } on failure.
define { i64, i1 } @promiseCollectIterable(i64 %iterable) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %iterable)
  %msg = call i64 @valueBoxString(ptr @.promise.err.not.iterable, i64 24)
  call void @gcRootPush(i64 %msg)
  %opened = call { i64, i1 } @getIteratorValue(i64 %iterable, i64 %msg)
  %iter = extractvalue { i64, i1 } %opened, 0
  %open.err = extractvalue { i64, i1 } %opened, 1
  call void @gcRootPush(i64 %iter)
  br i1 %open.err, label %fail.open, label %collect
fail.open:
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %opened
collect:
  %arr = call ptr @arrayNew(i64 0)
  %arr.box = call i64 @valueBoxArray(ptr %arr)
  call void @gcRootPush(i64 %arr.box)
  br label %loop
loop:
  %step.res = call { i64, i1 } @callIteratorNext(i64 %iter)
  %step = extractvalue { i64, i1 } %step.res, 0
  %step.err = extractvalue { i64, i1 } %step.res, 1
  br i1 %step.err, label %fail.step, label %check.done
fail.step:
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %step.res
check.done:
  %done.val = call i64 @valuePropertyGet(i64 %step, i64 4, ptr @.iter.key.done)
  %done = call i1 @valueTruthy(i64 %done.val)
  br i1 %done, label %success, label %read.val
read.val:
  %item = call i64 @valuePropertyGet(i64 %step, i64 5, ptr @.iter.key.value)
  call i64 @arrayPush(ptr %arr, i64 %item)
  br label %loop
success:
  %r0 = insertvalue { i64, i1 } undef, i64 %arr.box, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %r1
}

; Promise.all element fulfillment handler: env=[0]=outPromise, [1]=resultsArr, [2]=remBox(1-elem arr), [3]=indexBox, [4]=calledBox(1-elem arr)
define { i64, i1 } @promiseAllFulfill(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %frame = call i64 @gcRootSave()
  %val = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %out.p = call i64 @environmentGet(ptr %env, i64 0)
  %res.box = call i64 @environmentGet(ptr %env, i64 1)
  %rem.box = call i64 @environmentGet(ptr %env, i64 2)
  %idx.box = call i64 @environmentGet(ptr %env, i64 3)
  %called.box = call i64 @environmentGet(ptr %env, i64 4)
  call void @gcRootPush(i64 %val)
  call void @gcRootPush(i64 %out.p)
  call void @gcRootPush(i64 %res.box)
  call void @gcRootPush(i64 %rem.box)
  call void @gcRootPush(i64 %called.box)
  %called.arr = call ptr @valueArrayPtr(i64 %called.box)
  %was.called = call i64 @arrayGet(ptr %called.arr, i64 0)
  %already = icmp ne i64 %was.called, 9222246136947933185
  br i1 %already, label %done, label %record
record:
  call void @arraySet(ptr %called.arr, i64 0, i64 9222246136947933186)
  %idx.d = call double @valueToNumber(i64 %idx.box)
  %idx = fptosi double %idx.d to i64
  %res.arr = call ptr @valueArrayPtr(i64 %res.box)
  call void @arraySet(ptr %res.arr, i64 %idx, i64 %val)
  %rem.arr = call ptr @valueArrayPtr(i64 %rem.box)
  %rem.val = call i64 @arrayGet(ptr %rem.arr, i64 0)
  %rem.d = call double @valueToNumber(i64 %rem.val)
  %rem.next.d = fsub double %rem.d, 1.0
  %rem.next.box = call i64 @valueBoxNumber(double %rem.next.d)
  call void @arraySet(ptr %rem.arr, i64 0, i64 %rem.next.box)
  %is.zero = fcmp oeq double %rem.next.d, 0.0
  br i1 %is.zero, label %finish, label %done
finish:
  call void @promiseResolve(i64 %out.p, i64 %res.box)
  br label %done
done:
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } { i64 9222246136947933184, i1 false }
}

define { i64, i1 } @promiseSimpleReject(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %out.p = call i64 @environmentGet(ptr %env, i64 0)
  %reason = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  call void @promiseReject(i64 %out.p, i64 %reason)
  ret { i64, i1 } { i64 9222246136947933184, i1 false }
}

define { i64, i1 } @promiseSimpleResolve(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %out.p = call i64 @environmentGet(ptr %env, i64 0)
  %val = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  call void @promiseResolve(i64 %out.p, i64 %val)
  ret { i64, i1 } { i64 9222246136947933184, i1 false }
}

define i64 @promiseAll(i64 %iterable) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %iterable)
  %out.p = call i64 @promiseCreate()
  call void @gcRootPush(i64 %out.p)
  %collected = call { i64, i1 } @promiseCollectIterable(i64 %iterable)
  %items.box = extractvalue { i64, i1 } %collected, 0
  %col.err = extractvalue { i64, i1 } %collected, 1
  call void @gcRootPush(i64 %items.box)
  br i1 %col.err, label %reject.col, label %check.len
reject.col:
  call void @promiseReject(i64 %out.p, i64 %items.box)
  call void @gcRootRestore(i64 %frame)
  ret i64 %out.p
check.len:
  %items = call ptr @valueArrayPtr(i64 %items.box)
  %len = call i64 @arrayLength(ptr %items)
  %res.arr = call ptr @arrayNew(i64 %len)
  %res.box = call i64 @valueBoxArray(ptr %res.arr)
  call void @gcRootPush(i64 %res.box)
  %empty = icmp eq i64 %len, 0
  br i1 %empty, label %resolve.empty, label %attach.setup
resolve.empty:
  call void @promiseResolve(i64 %out.p, i64 %res.box)
  call void @gcRootRestore(i64 %frame)
  ret i64 %out.p
attach.setup:
  %rem.arr = call ptr @arrayNew(i64 1)
  %rem.box = call i64 @valueBoxArray(ptr %rem.arr)
  call void @gcRootPush(i64 %rem.box)
  %len.d = uitofp i64 %len to double
  %len.box = call i64 @valueBoxNumber(double %len.d)
  call void @arraySet(ptr %rem.arr, i64 0, i64 %len.box)
  %rej.env = call ptr @environmentNew(i64 1)
  %rej.env.box = call i64 @valueBoxObject(ptr %rej.env)
  call void @gcRootPush(i64 %rej.env.box)
  call void @environmentSet(ptr %rej.env, i64 0, i64 %out.p)
  %rej.fn = call i64 @functionObjectNew(ptr @promiseSimpleReject, ptr %rej.env, i64 9222246136947933184, i64 9222246136947933184, i64 1)
  call void @gcRootPush(i64 %rej.fn)
  br label %loop
loop:
  %i = phi i64 [ 0, %attach.setup ], [ %next, %body ]
  %done = icmp uge i64 %i, %len
  br i1 %done, label %finish, label %body
body:
  %item = call i64 @arrayGet(ptr %items, i64 %i)
  %p = call i64 @promiseResolveStatic(i64 %item)
  call void @gcRootPush(i64 %p)
  %called = call ptr @arrayNew(i64 1)
  %called.box = call i64 @valueBoxArray(ptr %called)
  call void @gcRootPush(i64 %called.box)
  call void @arraySet(ptr %called, i64 0, i64 9222246136947933185)
  %fenv = call ptr @environmentNew(i64 5)
  %fenv.box = call i64 @valueBoxObject(ptr %fenv)
  call void @gcRootPush(i64 %fenv.box)
  %i.d = uitofp i64 %i to double
  %i.box = call i64 @valueBoxNumber(double %i.d)
  call void @environmentSet(ptr %fenv, i64 0, i64 %out.p)
  call void @environmentSet(ptr %fenv, i64 1, i64 %res.box)
  call void @environmentSet(ptr %fenv, i64 2, i64 %rem.box)
  call void @environmentSet(ptr %fenv, i64 3, i64 %i.box)
  call void @environmentSet(ptr %fenv, i64 4, i64 %called.box)
  %ful.fn = call i64 @functionObjectNew(ptr @promiseAllFulfill, ptr %fenv, i64 9222246136947933184, i64 9222246136947933184, i64 1)
  call void @gcRootPush(i64 %ful.fn)
  call i64 @promiseThenAttach(i64 %p, i64 %ful.fn, i64 %rej.fn)
  %next = add i64 %i, 1
  br label %loop
finish:
  call void @gcRootRestore(i64 %frame)
  ret i64 %out.p
}

define i64 @promiseRace(i64 %iterable) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %iterable)
  %out.p = call i64 @promiseCreate()
  call void @gcRootPush(i64 %out.p)
  %collected = call { i64, i1 } @promiseCollectIterable(i64 %iterable)
  %items.box = extractvalue { i64, i1 } %collected, 0
  %col.err = extractvalue { i64, i1 } %collected, 1
  call void @gcRootPush(i64 %items.box)
  br i1 %col.err, label %reject.col, label %setup
reject.col:
  call void @promiseReject(i64 %out.p, i64 %items.box)
  call void @gcRootRestore(i64 %frame)
  ret i64 %out.p
setup:
  %items = call ptr @valueArrayPtr(i64 %items.box)
  %len = call i64 @arrayLength(ptr %items)
  %env = call ptr @environmentNew(i64 1)
  %env.box = call i64 @valueBoxObject(ptr %env)
  call void @gcRootPush(i64 %env.box)
  call void @environmentSet(ptr %env, i64 0, i64 %out.p)
  %res.fn = call i64 @functionObjectNew(ptr @promiseSimpleResolve, ptr %env, i64 9222246136947933184, i64 9222246136947933184, i64 1)
  call void @gcRootPush(i64 %res.fn)
  %rej.fn = call i64 @functionObjectNew(ptr @promiseSimpleReject, ptr %env, i64 9222246136947933184, i64 9222246136947933184, i64 1)
  call void @gcRootPush(i64 %rej.fn)
  br label %loop
loop:
  %i = phi i64 [ 0, %setup ], [ %next, %body ]
  %done = icmp uge i64 %i, %len
  br i1 %done, label %finish, label %body
body:
  %item = call i64 @arrayGet(ptr %items, i64 %i)
  %p = call i64 @promiseResolveStatic(i64 %item)
  call void @gcRootPush(i64 %p)
  call i64 @promiseThenAttach(i64 %p, i64 %res.fn, i64 %rej.fn)
  %next = add i64 %i, 1
  br label %loop
finish:
  call void @gcRootRestore(i64 %frame)
  ret i64 %out.p
}

; Promise.allSettled element handler: env=[0]=outPromise, [1]=resultsArr, [2]=remArr, [3]=idxBox, [4]=calledArr, [5]=isReject(bool)
define { i64, i1 } @promiseAllSettledItem(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %frame = call i64 @gcRootSave()
  %val = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %out.p = call i64 @environmentGet(ptr %env, i64 0)
  %res.box = call i64 @environmentGet(ptr %env, i64 1)
  %rem.box = call i64 @environmentGet(ptr %env, i64 2)
  %idx.box = call i64 @environmentGet(ptr %env, i64 3)
  %called.box = call i64 @environmentGet(ptr %env, i64 4)
  %is.rej.box = call i64 @environmentGet(ptr %env, i64 5)
  call void @gcRootPush(i64 %val)
  call void @gcRootPush(i64 %out.p)
  call void @gcRootPush(i64 %res.box)
  call void @gcRootPush(i64 %rem.box)
  call void @gcRootPush(i64 %called.box)
  %called.arr = call ptr @valueArrayPtr(i64 %called.box)
  %was.called = call i64 @arrayGet(ptr %called.arr, i64 0)
  %already = icmp ne i64 %was.called, 9222246136947933185
  br i1 %already, label %done, label %record
record:
  call void @arraySet(ptr %called.arr, i64 0, i64 9222246136947933186)
  %entry.obj = call ptr @objectNew(i64 2)
  %entry.box = call i64 @valueBoxObject(ptr %entry.obj)
  call void @gcRootPush(i64 %entry.box)
  %is.rej = icmp eq i64 %is.rej.box, 9222246136947933186
  br i1 %is.rej, label %set.rej, label %set.ful
set.ful:
  %ful.str = call i64 @valueBoxString(ptr @.promise.str.fulfilled, i64 9)
  call void @objectSet(ptr %entry.obj, i64 6, ptr @.promise.key.status, i64 %ful.str)
  call void @objectSet(ptr %entry.obj, i64 5, ptr @.promise.key.value, i64 %val)
  br label %store
set.rej:
  %rej.str = call i64 @valueBoxString(ptr @.promise.str.rejected, i64 8)
  call void @objectSet(ptr %entry.obj, i64 6, ptr @.promise.key.status, i64 %rej.str)
  call void @objectSet(ptr %entry.obj, i64 6, ptr @.promise.key.reason, i64 %val)
  br label %store
store:
  %idx.d = call double @valueToNumber(i64 %idx.box)
  %idx = fptosi double %idx.d to i64
  %res.arr = call ptr @valueArrayPtr(i64 %res.box)
  call void @arraySet(ptr %res.arr, i64 %idx, i64 %entry.box)
  %rem.arr = call ptr @valueArrayPtr(i64 %rem.box)
  %rem.val = call i64 @arrayGet(ptr %rem.arr, i64 0)
  %rem.d = call double @valueToNumber(i64 %rem.val)
  %rem.next.d = fsub double %rem.d, 1.0
  %rem.next.box = call i64 @valueBoxNumber(double %rem.next.d)
  call void @arraySet(ptr %rem.arr, i64 0, i64 %rem.next.box)
  %is.zero = fcmp oeq double %rem.next.d, 0.0
  br i1 %is.zero, label %finish, label %done
finish:
  call void @promiseResolve(i64 %out.p, i64 %res.box)
  br label %done
done:
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } { i64 9222246136947933184, i1 false }
}

define i64 @promiseAllSettled(i64 %iterable) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %iterable)
  %out.p = call i64 @promiseCreate()
  call void @gcRootPush(i64 %out.p)
  %collected = call { i64, i1 } @promiseCollectIterable(i64 %iterable)
  %items.box = extractvalue { i64, i1 } %collected, 0
  %col.err = extractvalue { i64, i1 } %collected, 1
  call void @gcRootPush(i64 %items.box)
  br i1 %col.err, label %reject.col, label %check.len
reject.col:
  call void @promiseReject(i64 %out.p, i64 %items.box)
  call void @gcRootRestore(i64 %frame)
  ret i64 %out.p
check.len:
  %items = call ptr @valueArrayPtr(i64 %items.box)
  %len = call i64 @arrayLength(ptr %items)
  %res.arr = call ptr @arrayNew(i64 %len)
  %res.box = call i64 @valueBoxArray(ptr %res.arr)
  call void @gcRootPush(i64 %res.box)
  %empty = icmp eq i64 %len, 0
  br i1 %empty, label %resolve.empty, label %setup
resolve.empty:
  call void @promiseResolve(i64 %out.p, i64 %res.box)
  call void @gcRootRestore(i64 %frame)
  ret i64 %out.p
setup:
  %rem.arr = call ptr @arrayNew(i64 1)
  %rem.box = call i64 @valueBoxArray(ptr %rem.arr)
  call void @gcRootPush(i64 %rem.box)
  %len.d = uitofp i64 %len to double
  %len.box = call i64 @valueBoxNumber(double %len.d)
  call void @arraySet(ptr %rem.arr, i64 0, i64 %len.box)
  br label %loop
loop:
  %i = phi i64 [ 0, %setup ], [ %next, %body ]
  %done = icmp uge i64 %i, %len
  br i1 %done, label %finish, label %body
body:
  %item = call i64 @arrayGet(ptr %items, i64 %i)
  %p = call i64 @promiseResolveStatic(i64 %item)
  call void @gcRootPush(i64 %p)
  %called = call ptr @arrayNew(i64 1)
  %called.box = call i64 @valueBoxArray(ptr %called)
  call void @gcRootPush(i64 %called.box)
  call void @arraySet(ptr %called, i64 0, i64 9222246136947933185)
  %i.d = uitofp i64 %i to double
  %i.box = call i64 @valueBoxNumber(double %i.d)
  %fenv = call ptr @environmentNew(i64 6)
  %fenv.box = call i64 @valueBoxObject(ptr %fenv)
  call void @gcRootPush(i64 %fenv.box)
  call void @environmentSet(ptr %fenv, i64 0, i64 %out.p)
  call void @environmentSet(ptr %fenv, i64 1, i64 %res.box)
  call void @environmentSet(ptr %fenv, i64 2, i64 %rem.box)
  call void @environmentSet(ptr %fenv, i64 3, i64 %i.box)
  call void @environmentSet(ptr %fenv, i64 4, i64 %called.box)
  call void @environmentSet(ptr %fenv, i64 5, i64 9222246136947933185)
  %ful.fn = call i64 @functionObjectNew(ptr @promiseAllSettledItem, ptr %fenv, i64 9222246136947933184, i64 9222246136947933184, i64 1)
  call void @gcRootPush(i64 %ful.fn)
  %renv = call ptr @environmentNew(i64 6)
  %renv.box = call i64 @valueBoxObject(ptr %renv)
  call void @gcRootPush(i64 %renv.box)
  call void @environmentSet(ptr %renv, i64 0, i64 %out.p)
  call void @environmentSet(ptr %renv, i64 1, i64 %res.box)
  call void @environmentSet(ptr %renv, i64 2, i64 %rem.box)
  call void @environmentSet(ptr %renv, i64 3, i64 %i.box)
  call void @environmentSet(ptr %renv, i64 4, i64 %called.box)
  call void @environmentSet(ptr %renv, i64 5, i64 9222246136947933186)
  %rej.fn = call i64 @functionObjectNew(ptr @promiseAllSettledItem, ptr %renv, i64 9222246136947933184, i64 9222246136947933184, i64 1)
  call void @gcRootPush(i64 %rej.fn)
  call i64 @promiseThenAttach(i64 %p, i64 %ful.fn, i64 %rej.fn)
  %next = add i64 %i, 1
  br label %loop
finish:
  call void @gcRootRestore(i64 %frame)
  ret i64 %out.p
}

define { i64, i1 } @promiseAnyReject(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %frame = call i64 @gcRootSave()
  %reason = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %out.p = call i64 @environmentGet(ptr %env, i64 0)
  %errs.box = call i64 @environmentGet(ptr %env, i64 1)
  %rem.box = call i64 @environmentGet(ptr %env, i64 2)
  %idx.box = call i64 @environmentGet(ptr %env, i64 3)
  %called.box = call i64 @environmentGet(ptr %env, i64 4)
  call void @gcRootPush(i64 %reason)
  call void @gcRootPush(i64 %out.p)
  call void @gcRootPush(i64 %errs.box)
  call void @gcRootPush(i64 %rem.box)
  call void @gcRootPush(i64 %called.box)
  %called.arr = call ptr @valueArrayPtr(i64 %called.box)
  %was.called = call i64 @arrayGet(ptr %called.arr, i64 0)
  %already = icmp ne i64 %was.called, 9222246136947933185
  br i1 %already, label %done, label %record
record:
  call void @arraySet(ptr %called.arr, i64 0, i64 9222246136947933186)
  %idx.d = call double @valueToNumber(i64 %idx.box)
  %idx = fptosi double %idx.d to i64
  %errs.arr = call ptr @valueArrayPtr(i64 %errs.box)
  call void @arraySet(ptr %errs.arr, i64 %idx, i64 %reason)
  %rem.arr = call ptr @valueArrayPtr(i64 %rem.box)
  %rem.val = call i64 @arrayGet(ptr %rem.arr, i64 0)
  %rem.d = call double @valueToNumber(i64 %rem.val)
  %rem.next.d = fsub double %rem.d, 1.0
  %rem.next.box = call i64 @valueBoxNumber(double %rem.next.d)
  call void @arraySet(ptr %rem.arr, i64 0, i64 %rem.next.box)
  %is.zero = fcmp oeq double %rem.next.d, 0.0
  br i1 %is.zero, label %reject.all, label %done
reject.all:
  %msg = call i64 @valueBoxString(ptr @.promise.err.all.rejected, i64 26)
  %err.obj = call ptr @errorNew(i64 1, i64 14, ptr @.promise.err.aggregate, i64 %msg)
  %err.val = call i64 @valueBoxObject(ptr %err.obj)
  call void @promiseReject(i64 %out.p, i64 %err.val)
  br label %done
done:
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } { i64 9222246136947933184, i1 false }
}

define i64 @promiseAny(i64 %iterable) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %iterable)
  %out.p = call i64 @promiseCreate()
  call void @gcRootPush(i64 %out.p)
  %collected = call { i64, i1 } @promiseCollectIterable(i64 %iterable)
  %items.box = extractvalue { i64, i1 } %collected, 0
  %col.err = extractvalue { i64, i1 } %collected, 1
  call void @gcRootPush(i64 %items.box)
  br i1 %col.err, label %reject.col, label %check.len
reject.col:
  call void @promiseReject(i64 %out.p, i64 %items.box)
  call void @gcRootRestore(i64 %frame)
  ret i64 %out.p
check.len:
  %items = call ptr @valueArrayPtr(i64 %items.box)
  %len = call i64 @arrayLength(ptr %items)
  %empty = icmp eq i64 %len, 0
  br i1 %empty, label %reject.empty, label %setup
reject.empty:
  %emsg = call i64 @valueBoxString(ptr @.promise.err.all.rejected, i64 26)
  %eobj = call ptr @errorNew(i64 1, i64 14, ptr @.promise.err.aggregate, i64 %emsg)
  %eval = call i64 @valueBoxObject(ptr %eobj)
  call void @promiseReject(i64 %out.p, i64 %eval)
  call void @gcRootRestore(i64 %frame)
  ret i64 %out.p
setup:
  %errs.arr = call ptr @arrayNew(i64 %len)
  %errs.box = call i64 @valueBoxArray(ptr %errs.arr)
  call void @gcRootPush(i64 %errs.box)
  %rem.arr = call ptr @arrayNew(i64 1)
  %rem.box = call i64 @valueBoxArray(ptr %rem.arr)
  call void @gcRootPush(i64 %rem.box)
  %len.d = uitofp i64 %len to double
  %len.box = call i64 @valueBoxNumber(double %len.d)
  call void @arraySet(ptr %rem.arr, i64 0, i64 %len.box)
  %res.env = call ptr @environmentNew(i64 1)
  %res.env.box = call i64 @valueBoxObject(ptr %res.env)
  call void @gcRootPush(i64 %res.env.box)
  call void @environmentSet(ptr %res.env, i64 0, i64 %out.p)
  %res.fn = call i64 @functionObjectNew(ptr @promiseSimpleResolve, ptr %res.env, i64 9222246136947933184, i64 9222246136947933184, i64 1)
  call void @gcRootPush(i64 %res.fn)
  br label %loop
loop:
  %i = phi i64 [ 0, %setup ], [ %next, %body ]
  %done = icmp uge i64 %i, %len
  br i1 %done, label %finish, label %body
body:
  %item = call i64 @arrayGet(ptr %items, i64 %i)
  %p = call i64 @promiseResolveStatic(i64 %item)
  call void @gcRootPush(i64 %p)
  %called = call ptr @arrayNew(i64 1)
  %called.box = call i64 @valueBoxArray(ptr %called)
  call void @gcRootPush(i64 %called.box)
  call void @arraySet(ptr %called, i64 0, i64 9222246136947933185)
  %renv = call ptr @environmentNew(i64 5)
  %renv.box = call i64 @valueBoxObject(ptr %renv)
  call void @gcRootPush(i64 %renv.box)
  %i.d = uitofp i64 %i to double
  %i.box = call i64 @valueBoxNumber(double %i.d)
  call void @environmentSet(ptr %renv, i64 0, i64 %out.p)
  call void @environmentSet(ptr %renv, i64 1, i64 %errs.box)
  call void @environmentSet(ptr %renv, i64 2, i64 %rem.box)
  call void @environmentSet(ptr %renv, i64 3, i64 %i.box)
  call void @environmentSet(ptr %renv, i64 4, i64 %called.box)
  %rej.fn = call i64 @functionObjectNew(ptr @promiseAnyReject, ptr %renv, i64 9222246136947933184, i64 9222246136947933184, i64 1)
  call void @gcRootPush(i64 %rej.fn)
  call i64 @promiseThenAttach(i64 %p, i64 %res.fn, i64 %rej.fn)
  %next = add i64 %i, 1
  br label %loop
finish:
  call void @gcRootRestore(i64 %frame)
  ret i64 %out.p
}

; Async state-machine driver: env=[0]=outPromise, [1]=stepFn
define { i64, i1 } @asyncResumeOk(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %out.p = call i64 @environmentGet(ptr %env, i64 0)
  %step.fn = call i64 @environmentGet(ptr %env, i64 1)
  %val = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  call void @asyncDrive(i64 %out.p, i64 %step.fn, double 0.0, i64 %val)
  ret { i64, i1 } { i64 9222246136947933184, i1 false }
}

define { i64, i1 } @asyncResumeErr(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %out.p = call i64 @environmentGet(ptr %env, i64 0)
  %step.fn = call i64 @environmentGet(ptr %env, i64 1)
  %err = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  call void @asyncDrive(i64 %out.p, i64 %step.fn, double 2.0, i64 %err)
  ret { i64, i1 } { i64 9222246136947933184, i1 false }
}

define void @asyncDrive(i64 %out.p, i64 %step.fn, double %mode.num, i64 %arg.val) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %out.p)
  call void @gcRootPush(i64 %step.fn)
  call void @gcRootPush(i64 %arg.val)
  %mode.box = call i64 @valueBoxNumber(double %mode.num)
  %argv = alloca [2 x i64]
  %s0 = getelementptr [2 x i64], ptr %argv, i64 0, i64 0
  %s1 = getelementptr [2 x i64], ptr %argv, i64 0, i64 1
  store i64 %mode.box, ptr %s0
  store i64 %arg.val, ptr %s1
  %step.res = call { i64, i1 } @jsCall(i64 %step.fn, i64 2, ptr %argv, i64 9222246136947933184)
  %payload = extractvalue { i64, i1 } %step.res, 0
  %threw = extractvalue { i64, i1 } %step.res, 1
  call void @gcRootPush(i64 %payload)
  br i1 %threw, label %reject, label %inspect
reject:
  call void @promiseReject(i64 %out.p, i64 %payload)
  br label %done
inspect:
  %done.val = call i64 @valuePropertyGet(i64 %payload, i64 4, ptr @.iter.key.done)
  %is.done = call i1 @valueTruthy(i64 %done.val)
  %yielded = call i64 @valuePropertyGet(i64 %payload, i64 5, ptr @.iter.key.value)
  call void @gcRootPush(i64 %yielded)
  br i1 %is.done, label %resolve, label %suspend
resolve:
  call void @promiseResolve(i64 %out.p, i64 %yielded)
  br label %done
suspend:
  %awaited = call i64 @promiseResolveStatic(i64 %yielded)
  call void @gcRootPush(i64 %awaited)
  %env = call ptr @environmentNew(i64 2)
  %env.box = call i64 @valueBoxObject(ptr %env)
  call void @gcRootPush(i64 %env.box)
  call void @environmentSet(ptr %env, i64 0, i64 %out.p)
  call void @environmentSet(ptr %env, i64 1, i64 %step.fn)
  %ok.fn = call i64 @functionObjectNew(ptr @asyncResumeOk, ptr %env, i64 9222246136947933184, i64 9222246136947933184, i64 1)
  call void @gcRootPush(i64 %ok.fn)
  %err.fn = call i64 @functionObjectNew(ptr @asyncResumeErr, ptr %env, i64 9222246136947933184, i64 9222246136947933184, i64 1)
  call void @gcRootPush(i64 %err.fn)
  call i64 @promiseThenAttach(i64 %awaited, i64 %ok.fn, i64 %err.fn)
  br label %done
done:
  call void @gcRootRestore(i64 %frame)
  ret void
}

define i64 @asyncStart(i64 %step.fn) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %step.fn)
  %out.p = call i64 @promiseCreate()
  call void @gcRootPush(i64 %out.p)
  call void @asyncDrive(i64 %out.p, i64 %step.fn, double 0.0, i64 9222246136947933184)
  call void @gcRootRestore(i64 %frame)
  ret i64 %out.p
}
