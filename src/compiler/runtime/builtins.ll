; ES2023 runtime builtins: BigInt (tag 0x7FFE), Proxy (object header flag 1),
; Date, RegExp, Int32Array, Uint32Array, AbortController, Intl, Math, String, Number, Boolean, setInterval/clearInterval.

; --- BigInt (NaN-box tag 0x7FFE_0000_0000_0000 = 9222809086901354496) ---

@.bi.fmt = private unnamed_addr constant [5 x i8] c"%lld\00"
@.bi.n.BigInt = private unnamed_addr constant [7 x i8] c"BigInt\00"
@.bi.n.asIntN = private unnamed_addr constant [7 x i8] c"asIntN\00"
@.bi.n.asUintN = private unnamed_addr constant [8 x i8] c"asUintN\00"
@.bi.n.toString = private unnamed_addr constant [9 x i8] c"toString\00"
@.bi.n.valueOf = private unnamed_addr constant [8 x i8] c"valueOf\00"

@jsBigIntCtorCache = internal global i64 0
@jsProxyCtorCache = internal global i64 0
@jsDateCtorCache = internal global i64 0
@jsRegExpCtorCache = internal global i64 0
@jsInt32ArrayCtorCache = internal global i64 0
@jsUint32ArrayCtorCache = internal global i64 0
@jsAbortCtorCache = internal global i64 0
@jsIntlObjCache = internal global i64 0
@jsMathObjCache = internal global i64 0
@jsStringCtorCache = internal global i64 0
@jsNumberCtorCache = internal global i64 0
@jsBooleanCtorCache = internal global i64 0
@jsSetIntervalCache = internal global i64 0
@jsClearIntervalCache = internal global i64 0

define i1 @valueIsBigInt(i64 %value) {
entry:
  %tag = and i64 %value, -281474976710656
  %is.bi = icmp eq i64 %tag, 9222809086901354496
  ret i1 %is.bi
}

define i64 @bigIntFromI64(i64 %n) {
entry:
  %cell = call ptr @malloc(i64 8)
  store i64 %n, ptr %cell
  %addr = ptrtoint ptr %cell to i64
  %payload = and i64 %addr, 281474976710655
  %tagged = or i64 %payload, 9222809086901354496
  ret i64 %tagged
}

define i64 @bigIntToI64(i64 %value) {
entry:
  %payload = and i64 %value, 281474976710655
  %cell = inttoptr i64 %payload to ptr
  %n = load i64, ptr %cell
  ret i64 %n
}

define i64 @bigIntFromString(ptr %src, i64 %len) {
entry:
  %alloc = add i64 %len, 1
  %buf = call ptr @malloc(i64 %alloc)
  %has = icmp ne i64 %len, 0
  br i1 %has, label %copy, label %parse
copy:
  call ptr @memcpy(ptr %buf, ptr %src, i64 %len)
  br label %parse
parse:
  %nul = getelementptr i8, ptr %buf, i64 %len
  store i8 0, ptr %nul
  %n = call i64 @strtol(ptr %buf, ptr null, i32 0)
  call void @free(ptr %buf)
  %bi = call i64 @bigIntFromI64(i64 %n)
  ret i64 %bi
}

define { ptr, i64 } @bigIntToString(i64 %value) {
entry:
  %n = call i64 @bigIntToI64(i64 %value)
  %buf = call ptr @malloc(i64 32)
  %len32 = call i32 (ptr, ptr, ...) @sprintf(ptr %buf, ptr @.bi.fmt, i64 %n)
  %len = sext i32 %len32 to i64
  %r0 = insertvalue { ptr, i64 } undef, ptr %buf, 0
  %r1 = insertvalue { ptr, i64 } %r0, i64 %len, 1
  ret { ptr, i64 } %r1
}

define { i64, i1 } @bigIntProtoToString(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %s = call { ptr, i64 } @bigIntToString(i64 %this.val)
  %sp = extractvalue { ptr, i64 } %s, 0
  %sl = extractvalue { ptr, i64 } %s, 1
  %boxed = call i64 @valueCopyString(ptr %sp, i64 %sl)
  %r0 = insertvalue { i64, i1 } undef, i64 %boxed, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
}

define { i64, i1 } @bigIntProtoValueOf(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %r0 = insertvalue { i64, i1 } undef, i64 %this.val, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
}

define i64 @bigIntPropertyGet(i64 %bi.val, i64 %key.len, ptr %key.ptr) {
entry:
  %is.ts = icmp eq i64 %key.len, 8
  br i1 %is.ts, label %cmp.ts, label %check.vo
cmp.ts:
  %c0 = call i32 @memcmp(ptr %key.ptr, ptr @.bi.n.toString, i64 8)
  %m0 = icmp eq i32 %c0, 0
  br i1 %m0, label %ret.ts, label %check.vo
ret.ts:
  %fn0 = call i64 @functionObjectNew(ptr @bigIntProtoToString, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 0)
  ret i64 %fn0
check.vo:
  %is.vo = icmp eq i64 %key.len, 7
  br i1 %is.vo, label %cmp.vo, label %missing
cmp.vo:
  %c1 = call i32 @memcmp(ptr %key.ptr, ptr @.bi.n.valueOf, i64 7)
  %m1 = icmp eq i32 %c1, 0
  br i1 %m1, label %ret.vo, label %missing
ret.vo:
  %fn1 = call i64 @functionObjectNew(ptr @bigIntProtoValueOf, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 0)
  ret i64 %fn1
missing:
  ret i64 9222246136947933184
}

define { i64, i1 } @bigIntCtorInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %ok = icmp uge i64 %argc, 1
  br i1 %ok, label %check, label %zero
check:
  %a0 = load i64, ptr %argv
  %is.bi = call i1 @valueIsBigInt(i64 %a0)
  br i1 %is.bi, label %ret.same, label %check.str
ret.same:
  %s0 = insertvalue { i64, i1 } undef, i64 %a0, 0
  %s1 = insertvalue { i64, i1 } %s0, i1 false, 1
  ret { i64, i1 } %s1
check.str:
  %is.str = call i1 @valueIsString(i64 %a0)
  br i1 %is.str, label %from.str, label %from.num
from.str:
  %sp = call ptr @valueStringPtr(i64 %a0)
  %sl = call i64 @valueStringLength(i64 %a0)
  %bi.s = call i64 @bigIntFromString(ptr %sp, i64 %sl)
  %sr0 = insertvalue { i64, i1 } undef, i64 %bi.s, 0
  %sr1 = insertvalue { i64, i1 } %sr0, i1 false, 1
  ret { i64, i1 } %sr1
from.num:
  %d = call double @valueToNumber(i64 %a0)
  %n = fptosi double %d to i64
  %bi.n = call i64 @bigIntFromI64(i64 %n)
  %nr0 = insertvalue { i64, i1 } undef, i64 %bi.n, 0
  %nr1 = insertvalue { i64, i1 } %nr0, i1 false, 1
  ret { i64, i1 } %nr1
zero:
  %z = call i64 @bigIntFromI64(i64 0)
  %z0 = insertvalue { i64, i1 } undef, i64 %z, 0
  %z1 = insertvalue { i64, i1 } %z0, i1 false, 1
  ret { i64, i1 } %z1
}

define { i64, i1 } @bigIntAsIntNInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %ok = icmp uge i64 %argc, 2
  br i1 %ok, label %go, label %zero
go:
  %b.slot = getelementptr i64, ptr %argv, i64 1
  %bv = load i64, ptr %b.slot
  %is.bi = call i1 @valueIsBigInt(i64 %bv)
  br i1 %is.bi, label %ret.bv, label %zero
ret.bv:
  %r0 = insertvalue { i64, i1 } undef, i64 %bv, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
zero:
  %z = call i64 @bigIntFromI64(i64 0)
  %z0 = insertvalue { i64, i1 } undef, i64 %z, 0
  %z1 = insertvalue { i64, i1 } %z0, i1 false, 1
  ret { i64, i1 } %z1
}

define i64 @jsBigIntConstructor() {
entry:
  %cached = load i64, ptr @jsBigIntCtorCache
  %ready = icmp ne i64 %cached, 0
  br i1 %ready, label %ret.cached, label %build
ret.cached:
  ret i64 %cached
build:
  %frame = call i64 @gcRootSave()
  %name.s = call i64 @valueCopyString(ptr @.bi.n.BigInt, i64 6)
  call void @gcRootPush(i64 %name.s)
  %ctor = call i64 @functionObjectNew(ptr @bigIntCtorInvoke, ptr null, i64 9222246136947933184, i64 %name.s, i64 1)
  call void @gcRootPush(i64 %ctor)
  %props = call ptr @objectNew(i64 4)
  %props.v = call i64 @valueBoxObject(ptr %props)
  call void @gcRootPush(i64 %props.v)
  call void @jsAttachMethod(ptr %props, i64 6, ptr @.bi.n.asIntN, ptr @bigIntAsIntNInvoke, i64 2)
  call void @jsAttachMethod(ptr %props, i64 7, ptr @.bi.n.asUintN, ptr @bigIntAsIntNInvoke, i64 2)
  call void @functionObjectAttachProperties(i64 %ctor, i64 %props.v)
  store i64 %ctor, ptr @jsBigIntCtorCache
  call void @gcRegisterGlobalRoot(ptr @jsBigIntCtorCache)
  call void @gcRootRestore(i64 %frame)
  ret i64 %ctor
}

; --- ES6 Proxy (stored as object with GC header reserved byte cell+4 == 1) ---

@.px.k.target = private unnamed_addr constant [10 x i8] c"\EF\A3\BF__px_t\00"
@.px.k.handler = private unnamed_addr constant [10 x i8] c"\EF\A3\BF__px_h\00"
@.px.n.Proxy = private unnamed_addr constant [6 x i8] c"Proxy\00"
@.px.n.get = private unnamed_addr constant [4 x i8] c"get\00"
@.px.n.set = private unnamed_addr constant [4 x i8] c"set\00"
@.px.n.has = private unnamed_addr constant [4 x i8] c"has\00"

define i1 @valueIsProxy(i64 %value) {
entry:
  %is.obj = call i1 @valueIsObject(i64 %value)
  br i1 %is.obj, label %check.col, label %no
check.col:
  %is.col = call i1 @valueIsCollection(i64 %value)
  br i1 %is.col, label %no, label %check.flag
check.flag:
  %obj = call ptr @valueObjectPtr(i64 %value)
  %flag.slot = getelementptr i8, ptr %obj, i64 -4
  %flag = load i8, ptr %flag.slot
  %is.px = icmp eq i8 %flag, 1
  ret i1 %is.px
no:
  ret i1 false
}

define i64 @jsProxyNew(i64 %target, i64 %handler) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %target)
  call void @gcRootPush(i64 %handler)
  %obj = call ptr @objectNew(i64 2)
  %ov = call i64 @valueBoxObject(ptr %obj)
  call void @gcRootPush(i64 %ov)
  call void @objectSet(ptr %obj, i64 9, ptr @.px.k.target, i64 %target)
  call void @objectSet(ptr %obj, i64 9, ptr @.px.k.handler, i64 %handler)
  %flag.slot = getelementptr i8, ptr %obj, i64 -4
  store i8 1, ptr %flag.slot
  call void @gcRootRestore(i64 %frame)
  ret i64 %ov
}

define i64 @jsProxyKeyValue(i64 %key.len, ptr %key.ptr) {
entry:
  %sym = call i64 @symbolFromPropertyKey(ptr %key.ptr, i64 %key.len)
  %is.sym = icmp ne i64 %sym, 0
  br i1 %is.sym, label %ret.sym, label %ret.str
ret.sym:
  ret i64 %sym
ret.str:
  %s = call i64 @valueCopyString(ptr %key.ptr, i64 %key.len)
  ret i64 %s
}

define { i64, i1 } @jsProxyGet(i64 %proxy, i64 %key.len, ptr %key.ptr) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %proxy)
  %obj = call ptr @valueObjectPtr(i64 %proxy)
  %target = call i64 @objectGet(ptr %obj, i64 9, ptr @.px.k.target)
  %handler = call i64 @objectGet(ptr %obj, i64 9, ptr @.px.k.handler)
  call void @gcRootPush(i64 %target)
  call void @gcRootPush(i64 %handler)
  %trap = call i64 @valuePropertyGet(i64 %handler, i64 3, ptr @.px.n.get)
  %has.trap = call i1 @valueIsFunction(i64 %trap)
  br i1 %has.trap, label %call.trap, label %forward
call.trap:
  %kval = call i64 @jsProxyKeyValue(i64 %key.len, ptr %key.ptr)
  call void @gcRootPush(i64 %kval)
  %args = alloca [3 x i64]
  store i64 %target, ptr %args
  %a1 = getelementptr i64, ptr %args, i64 1
  store i64 %kval, ptr %a1
  %a2 = getelementptr i64, ptr %args, i64 2
  store i64 %proxy, ptr %a2
  %res = call { i64, i1 } @jsCall(i64 %trap, i64 3, ptr %args, i64 %handler)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %res
forward:
  %fwd = call { i64, i1 } @checkedValuePropertyGet(i64 %target, i64 %key.len, ptr %key.ptr)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %fwd
}

define i1 @jsProxyHas(i64 %proxy, i64 %key.len, ptr %key.ptr) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %proxy)
  %obj = call ptr @valueObjectPtr(i64 %proxy)
  %target = call i64 @objectGet(ptr %obj, i64 9, ptr @.px.k.target)
  %handler = call i64 @objectGet(ptr %obj, i64 9, ptr @.px.k.handler)
  call void @gcRootPush(i64 %target)
  call void @gcRootPush(i64 %handler)
  %trap = call i64 @valuePropertyGet(i64 %handler, i64 3, ptr @.px.n.has)
  %has.trap = call i1 @valueIsFunction(i64 %trap)
  br i1 %has.trap, label %call.trap, label %forward
call.trap:
  %kval = call i64 @jsProxyKeyValue(i64 %key.len, ptr %key.ptr)
  call void @gcRootPush(i64 %kval)
  %args = alloca [2 x i64]
  store i64 %target, ptr %args
  %a1 = getelementptr i64, ptr %args, i64 1
  store i64 %kval, ptr %a1
  %res = call { i64, i1 } @jsCall(i64 %trap, i64 2, ptr %args, i64 %handler)
  %rv = extractvalue { i64, i1 } %res, 0
  %b = call i1 @valueTruthy(i64 %rv)
  call void @gcRootRestore(i64 %frame)
  ret i1 %b
forward:
  %fwd = call i1 @valueHasProperty(i64 %target, i64 %key.len, ptr %key.ptr)
  call void @gcRootRestore(i64 %frame)
  ret i1 %fwd
}

define { i64, i1 } @jsProxySet(i64 %proxy, i64 %key.len, ptr %key.ptr, i64 %val) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %proxy)
  call void @gcRootPush(i64 %val)
  %obj = call ptr @valueObjectPtr(i64 %proxy)
  %target = call i64 @objectGet(ptr %obj, i64 9, ptr @.px.k.target)
  %handler = call i64 @objectGet(ptr %obj, i64 9, ptr @.px.k.handler)
  call void @gcRootPush(i64 %target)
  call void @gcRootPush(i64 %handler)
  %trap = call i64 @valuePropertyGet(i64 %handler, i64 3, ptr @.px.n.set)
  %has.trap = call i1 @valueIsFunction(i64 %trap)
  br i1 %has.trap, label %call.trap, label %forward
call.trap:
  %kval = call i64 @jsProxyKeyValue(i64 %key.len, ptr %key.ptr)
  call void @gcRootPush(i64 %kval)
  %args = alloca [4 x i64]
  store i64 %target, ptr %args
  %a1 = getelementptr i64, ptr %args, i64 1
  store i64 %kval, ptr %a1
  %a2 = getelementptr i64, ptr %args, i64 2
  store i64 %val, ptr %a2
  %a3 = getelementptr i64, ptr %args, i64 3
  store i64 %proxy, ptr %a3
  %res = call { i64, i1 } @jsCall(i64 %trap, i64 4, ptr %args, i64 %handler)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %res
forward:
  %fwd = call { i64, i1 } @valueObjectSet(i64 %target, i64 %key.len, ptr %key.ptr, i64 %val)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %fwd
}

define { i64, i1 } @jsProxyCtorInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %ok = icmp uge i64 %argc, 2
  br i1 %ok, label %go, label %empty
go:
  %t = load i64, ptr %argv
  %hs = getelementptr i64, ptr %argv, i64 1
  %h = load i64, ptr %hs
  %px = call i64 @jsProxyNew(i64 %t, i64 %h)
  %r0 = insertvalue { i64, i1 } undef, i64 %px, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
empty:
  %o = call ptr @objectNew(i64 0)
  %ov = call i64 @valueBoxObject(ptr %o)
  %e0 = insertvalue { i64, i1 } undef, i64 %ov, 0
  %e1 = insertvalue { i64, i1 } %e0, i1 false, 1
  ret { i64, i1 } %e1
}

define i64 @jsProxyConstructor() {
entry:
  %cached = load i64, ptr @jsProxyCtorCache
  %ready = icmp ne i64 %cached, 0
  br i1 %ready, label %ret.cached, label %build
ret.cached:
  ret i64 %cached
build:
  %name.s = call i64 @valueCopyString(ptr @.px.n.Proxy, i64 5)
  %ctor = call i64 @functionObjectNew(ptr @jsProxyCtorInvoke, ptr null, i64 9222246136947933184, i64 %name.s, i64 2)
  store i64 %ctor, ptr @jsProxyCtorCache
  call void @gcRegisterGlobalRoot(ptr @jsProxyCtorCache)
  ret i64 %ctor
}

; --- Date constructor (supports 0, 1, or 2..7 calendar args) ---

@.date.n.Date = private unnamed_addr constant [5 x i8] c"Date\00"
@.date.n.now = private unnamed_addr constant [4 x i8] c"now\00"
@.date.n.UTC = private unnamed_addr constant [4 x i8] c"UTC\00"
@.date.n.parse = private unnamed_addr constant [6 x i8] c"parse\00"

define double @dateFromParts(i64 %year.in, i64 %month.in, i64 %day, i64 %hour, i64 %min, i64 %sec, i64 %ms) {
entry:
  ; Normalize year/month (month is 0-based).
  %y.adj = sdiv i64 %month.in, 12
  %m.rem = srem i64 %month.in, 12
  %m.neg = icmp slt i64 %m.rem, 0
  %m.norm = select i1 %m.neg, i64 12, i64 0
  %m0 = add i64 %m.rem, %m.norm
  %y.neg.adj = select i1 %m.neg, i64 -1, i64 0
  %y0 = add i64 %year.in, %y.adj
  %y1 = add i64 %y0, %y.neg.adj
  %m1 = add i64 %m0, 1
  ; Howard Hinnant days_from_civil(y, m, d):
  %is.jf = icmp sle i64 %m1, 2
  %y.dec = sub i64 %y1, 1
  %y = select i1 %is.jf, i64 %y.dec, i64 %y1
  %y.neg = icmp slt i64 %y, 0
  %y.era.num = select i1 %y.neg, i64 -399, i64 0
  %y.era.in = add i64 %y, %y.era.num
  %era = sdiv i64 %y.era.in, 400
  %era.400 = mul i64 %era, 400
  %yoe = sub i64 %y, %era.400
  %m.gt2 = icmp sgt i64 %m1, 2
  %m.off = select i1 %m.gt2, i64 -3, i64 9
  %m.adj = add i64 %m1, %m.off
  %m.153 = mul i64 %m.adj, 153
  %m.155 = add i64 %m.153, 2
  %m.days = sdiv i64 %m.155, 5
  %doy.0 = add i64 %m.days, %day
  %doy = sub i64 %doy.0, 1
  %yoe.365 = mul i64 %yoe, 365
  %yoe.4 = sdiv i64 %yoe, 4
  %yoe.100 = sdiv i64 %yoe, 100
  %doe.0 = add i64 %yoe.365, %yoe.4
  %doe.1 = sub i64 %doe.0, %yoe.100
  %doe = add i64 %doe.1, %doy
  %era.days = mul i64 %era, 146097
  %days.0 = add i64 %era.days, %doe
  %days = sub i64 %days.0, 719468
  %sec.d = mul i64 %days, 86400
  %sec.h = mul i64 %hour, 3600
  %sec.m = mul i64 %min, 60
  %t0 = add i64 %sec.d, %sec.h
  %t1 = add i64 %t0, %sec.m
  %t2 = add i64 %t1, %sec
  %ms.0 = mul i64 %t2, 1000
  %total.ms = add i64 %ms.0, %ms
  %res = sitofp i64 %total.ms to double
  ret double %res
}

define i64 @dateReadArgInt(i64 %argc, ptr %argv, i64 %idx, i64 %def) {
entry:
  %has = icmp ugt i64 %argc, %idx
  br i1 %has, label %read, label %use.def
read:
  %slot = getelementptr i64, ptr %argv, i64 %idx
  %v = load i64, ptr %slot
  %d = call double @valueToNumber(i64 %v)
  %n = fptosi double %d to i64
  ret i64 %n
use.def:
  ret i64 %def
}

define { i64, i1 } @jsDateCtorInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %is0 = icmp eq i64 %argc, 0
  br i1 %is0, label %now, label %check1
now:
  %t = call double @dateNow()
  %d0 = call i64 @dateNew(double %t)
  %r0 = insertvalue { i64, i1 } undef, i64 %d0, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
check1:
  %is1 = icmp eq i64 %argc, 1
  br i1 %is1, label %one, label %multi
one:
  %a0 = load i64, ptr %argv
  %ms1 = call double @valueToNumber(i64 %a0)
  %d1 = call i64 @dateNew(double %ms1)
  %o0 = insertvalue { i64, i1 } undef, i64 %d1, 0
  %o1 = insertvalue { i64, i1 } %o0, i1 false, 1
  ret { i64, i1 } %o1
multi:
  %y = call i64 @dateReadArgInt(i64 %argc, ptr %argv, i64 0, i64 1970)
  %mo = call i64 @dateReadArgInt(i64 %argc, ptr %argv, i64 1, i64 0)
  %da = call i64 @dateReadArgInt(i64 %argc, ptr %argv, i64 2, i64 1)
  %ho = call i64 @dateReadArgInt(i64 %argc, ptr %argv, i64 3, i64 0)
  %mi = call i64 @dateReadArgInt(i64 %argc, ptr %argv, i64 4, i64 0)
  %se = call i64 @dateReadArgInt(i64 %argc, ptr %argv, i64 5, i64 0)
  %ms = call i64 @dateReadArgInt(i64 %argc, ptr %argv, i64 6, i64 0)
  %ms.d = call double @dateFromParts(i64 %y, i64 %mo, i64 %da, i64 %ho, i64 %mi, i64 %se, i64 %ms)
  %dm = call i64 @dateNew(double %ms.d)
  %m0 = insertvalue { i64, i1 } undef, i64 %dm, 0
  %m1 = insertvalue { i64, i1 } %m0, i1 false, 1
  ret { i64, i1 } %m1
}

define { i64, i1 } @jsDateNowInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %t = call double @dateNow()
  %v = call i64 @valueBoxNumber(double %t)
  %r0 = insertvalue { i64, i1 } undef, i64 %v, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
}

define { i64, i1 } @jsDateUtcInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %y = call i64 @dateReadArgInt(i64 %argc, ptr %argv, i64 0, i64 1970)
  %mo = call i64 @dateReadArgInt(i64 %argc, ptr %argv, i64 1, i64 0)
  %da = call i64 @dateReadArgInt(i64 %argc, ptr %argv, i64 2, i64 1)
  %ho = call i64 @dateReadArgInt(i64 %argc, ptr %argv, i64 3, i64 0)
  %mi = call i64 @dateReadArgInt(i64 %argc, ptr %argv, i64 4, i64 0)
  %se = call i64 @dateReadArgInt(i64 %argc, ptr %argv, i64 5, i64 0)
  %ms = call i64 @dateReadArgInt(i64 %argc, ptr %argv, i64 6, i64 0)
  %ms.d = call double @dateFromParts(i64 %y, i64 %mo, i64 %da, i64 %ho, i64 %mi, i64 %se, i64 %ms)
  %v = call i64 @valueBoxNumber(double %ms.d)
  %r0 = insertvalue { i64, i1 } undef, i64 %v, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
}

define i64 @jsDateConstructor() {
entry:
  %cached = load i64, ptr @jsDateCtorCache
  %ready = icmp ne i64 %cached, 0
  br i1 %ready, label %ret.cached, label %build
ret.cached:
  ret i64 %cached
build:
  %frame = call i64 @gcRootSave()
  %name.s = call i64 @valueCopyString(ptr @.date.n.Date, i64 4)
  call void @gcRootPush(i64 %name.s)
  %ctor = call i64 @functionObjectNew(ptr @jsDateCtorInvoke, ptr null, i64 9222246136947933184, i64 %name.s, i64 7)
  call void @gcRootPush(i64 %ctor)
  %props = call ptr @objectNew(i64 4)
  %props.v = call i64 @valueBoxObject(ptr %props)
  call void @gcRootPush(i64 %props.v)
  call void @jsAttachMethod(ptr %props, i64 3, ptr @.date.n.now, ptr @jsDateNowInvoke, i64 0)
  call void @jsAttachMethod(ptr %props, i64 3, ptr @.date.n.UTC, ptr @jsDateUtcInvoke, i64 7)
  %dp = call ptr @datePrototype()
  %dpv = call i64 @valueBoxObject(ptr %dp)
  call void @objectSet(ptr %props, i64 9, ptr @.obj.n.prototype, i64 %dpv)
  call void @functionObjectAttachProperties(i64 %ctor, i64 %props.v)
  store i64 %ctor, ptr @jsDateCtorCache
  call void @gcRegisterGlobalRoot(ptr @jsDateCtorCache)
  call void @gcRootRestore(i64 %frame)
  ret i64 %ctor
}

; --- RegExp, Int32Array, Uint32Array, AbortController, Intl, Math, String, Number, Boolean ---

@.re.n.RegExp = private unnamed_addr constant [7 x i8] c"RegExp\00"

define { i64, i1 } @jsRegExpCtorInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %has0 = icmp uge i64 %argc, 1
  br i1 %has0, label %r0.b, label %u0.b
r0.b:
  %v0 = load i64, ptr %argv
  br label %c1
u0.b:
  br label %c1
c1:
  %pat = phi i64 [ %v0, %r0.b ], [ 9222246136947933184, %u0.b ]
  %has1 = icmp uge i64 %argc, 2
  br i1 %has1, label %r1.b, label %u1.b
r1.b:
  %s1 = getelementptr i64, ptr %argv, i64 1
  %v1 = load i64, ptr %s1
  br label %go
u1.b:
  br label %go
go:
  %flags = phi i64 [ %v1, %r1.b ], [ 9222246136947933184, %u1.b ]
  %res = call { i64, i1 } @regexCompile(i64 %pat, i64 %flags)
  ret { i64, i1 } %res
}

define i64 @jsRegExpConstructor() {
entry:
  %cached = load i64, ptr @jsRegExpCtorCache
  %ready = icmp ne i64 %cached, 0
  br i1 %ready, label %ret.cached, label %build
ret.cached:
  ret i64 %cached
build:
  %name.s = call i64 @valueCopyString(ptr @.re.n.RegExp, i64 6)
  %ctor = call i64 @functionObjectNew(ptr @jsRegExpCtorInvoke, ptr null, i64 9222246136947933184, i64 %name.s, i64 2)
  store i64 %ctor, ptr @jsRegExpCtorCache
  call void @gcRegisterGlobalRoot(ptr @jsRegExpCtorCache)
  %proto = call ptr @regexPrototype()
  call void @jsInstallPrototype(i64 %ctor, ptr %proto)
  ret i64 %ctor
}

define { i64, i1 } @jsTypedArrayCtorInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %has0 = icmp uge i64 %argc, 1
  br i1 %has0, label %r0.b, label %u0.b
r0.b:
  %a0 = load i64, ptr %argv
  br label %go
u0.b:
  br label %go
go:
  %arg = phi i64 [ %a0, %r0.b ], [ 9222246136947933184, %u0.b ]
  %arr = call i64 @nodeUint8ArrayNew(i64 %arg)
  %res0 = insertvalue { i64, i1 } undef, i64 %arr, 0
  %res1 = insertvalue { i64, i1 } %res0, i1 false, 1
  ret { i64, i1 } %res1
}

define i64 @jsInt32ArrayConstructor() {
entry:
  %cached = load i64, ptr @jsInt32ArrayCtorCache
  %ready = icmp ne i64 %cached, 0
  br i1 %ready, label %ret.cached, label %build
ret.cached:
  ret i64 %cached
build:
  %ctor = call i64 @functionObjectNew(ptr @jsTypedArrayCtorInvoke, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 1)
  store i64 %ctor, ptr @jsInt32ArrayCtorCache
  call void @gcRegisterGlobalRoot(ptr @jsInt32ArrayCtorCache)
  %proto = call ptr @objectNew(i64 0)
  call void @jsInstallPrototype(i64 %ctor, ptr %proto)
  ret i64 %ctor
}

define i64 @jsUint32ArrayConstructor() {
entry:
  %cached = load i64, ptr @jsUint32ArrayCtorCache
  %ready = icmp ne i64 %cached, 0
  br i1 %ready, label %ret.cached, label %build
ret.cached:
  ret i64 %cached
build:
  %ctor = call i64 @functionObjectNew(ptr @jsTypedArrayCtorInvoke, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 1)
  store i64 %ctor, ptr @jsUint32ArrayCtorCache
  call void @gcRegisterGlobalRoot(ptr @jsUint32ArrayCtorCache)
  %proto = call ptr @objectNew(i64 0)
  call void @jsInstallPrototype(i64 %ctor, ptr %proto)
  ret i64 %ctor
}

@.ac.n.signal = private unnamed_addr constant [7 x i8] c"signal\00"
@.ac.n.aborted = private unnamed_addr constant [8 x i8] c"aborted\00"
@.ac.n.abort = private unnamed_addr constant [6 x i8] c"abort\00"
@.ac.n.add = private unnamed_addr constant [17 x i8] c"addEventListener\00"
@.ac.n.rem = private unnamed_addr constant [20 x i8] c"removeEventListener\00"

define { i64, i1 } @jsNoopMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  ret { i64, i1 } { i64 9222246136947933184, i1 false }
}

define { i64, i1 } @jsAbortMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %sig = call i64 @valuePropertyGet(i64 %this.val, i64 6, ptr @.ac.n.signal)
  %s.r = call { i64, i1 } @valueObjectSet(i64 %sig, i64 7, ptr @.ac.n.aborted, i64 9222246136947933186)
  ret { i64, i1 } { i64 9222246136947933184, i1 false }
}

define { i64, i1 } @jsAbortControllerCtorInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %frame = call i64 @gcRootSave()
  %sig = call ptr @objectNew(i64 4)
  %sig.v = call i64 @valueBoxObject(ptr %sig)
  call void @gcRootPush(i64 %sig.v)
  call void @objectSet(ptr %sig, i64 7, ptr @.ac.n.aborted, i64 9222246136947933185)
  call void @jsAttachMethod(ptr %sig, i64 16, ptr @.ac.n.add, ptr @jsNoopMethod, i64 2)
  call void @jsAttachMethod(ptr %sig, i64 19, ptr @.ac.n.rem, ptr @jsNoopMethod, i64 2)
  %ctrl = call ptr @objectNew(i64 4)
  %ctrl.v = call i64 @valueBoxObject(ptr %ctrl)
  call void @gcRootPush(i64 %ctrl.v)
  call void @jsAdoptPrototype(ptr %ctrl, i64 %this.val)
  call void @objectSet(ptr %ctrl, i64 6, ptr @.ac.n.signal, i64 %sig.v)
  call void @jsAttachMethod(ptr %ctrl, i64 5, ptr @.ac.n.abort, ptr @jsAbortMethod, i64 1)
  call void @gcRootRestore(i64 %frame)
  %r0 = insertvalue { i64, i1 } undef, i64 %ctrl.v, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
}

define i64 @jsAbortControllerConstructor() {
entry:
  %cached = load i64, ptr @jsAbortCtorCache
  %ready = icmp ne i64 %cached, 0
  br i1 %ready, label %ret.cached, label %build
ret.cached:
  ret i64 %cached
build:
  %ctor = call i64 @functionObjectNew(ptr @jsAbortControllerCtorInvoke, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 0)
  store i64 %ctor, ptr @jsAbortCtorCache
  call void @gcRegisterGlobalRoot(ptr @jsAbortCtorCache)
  %proto = call ptr @objectNew(i64 0)
  call void @jsInstallPrototype(i64 %ctor, ptr %proto)
  ret i64 %ctor
}

@.intl.n.dtf = private unnamed_addr constant [15 x i8] c"DateTimeFormat\00"
@.intl.n.format = private unnamed_addr constant [7 x i8] c"format\00"
@.intl.n.formatParts = private unnamed_addr constant [14 x i8] c"formatToParts\00"
@.intl.n.resolved = private unnamed_addr constant [16 x i8] c"resolvedOptions\00"
@.intl.n.tz = private unnamed_addr constant [9 x i8] c"timeZone\00"
@.intl.v.utc = private unnamed_addr constant [4 x i8] c"UTC\00"

define { i64, i1 } @jsIntlFormatInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %has0 = icmp uge i64 %argc, 1
  br i1 %has0, label %go, label %empty
go:
  %a0 = load i64, ptr %argv
  %res = call { i64, i1 } @dateToIsoStringMethod(i64 0, ptr null, ptr null, i64 %a0)
  ret { i64, i1 } %res
empty:
  %s = call i64 @valueCopyString(ptr @.intl.v.utc, i64 0)
  %r0 = insertvalue { i64, i1 } undef, i64 %s, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
}

define { i64, i1 } @jsIntlFormatPartsInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %arr = call ptr @arrayNew(i64 0)
  %av = call i64 @valueBoxArray(ptr %arr)
  %r0 = insertvalue { i64, i1 } undef, i64 %av, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
}

define { i64, i1 } @jsIntlResolvedInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %frame = call i64 @gcRootSave()
  %obj = call ptr @objectNew(i64 2)
  %ov = call i64 @valueBoxObject(ptr %obj)
  call void @gcRootPush(i64 %ov)
  %utc = call i64 @valueCopyString(ptr @.intl.v.utc, i64 3)
  call void @objectSet(ptr %obj, i64 8, ptr @.intl.n.tz, i64 %utc)
  call void @gcRootRestore(i64 %frame)
  %r0 = insertvalue { i64, i1 } undef, i64 %ov, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
}

define { i64, i1 } @jsIntlDtfCtorInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %frame = call i64 @gcRootSave()
  %obj = call ptr @objectNew(i64 4)
  %ov = call i64 @valueBoxObject(ptr %obj)
  call void @gcRootPush(i64 %ov)
  call void @jsAttachMethod(ptr %obj, i64 6, ptr @.intl.n.format, ptr @jsIntlFormatInvoke, i64 1)
  call void @jsAttachMethod(ptr %obj, i64 13, ptr @.intl.n.formatParts, ptr @jsIntlFormatPartsInvoke, i64 1)
  call void @jsAttachMethod(ptr %obj, i64 15, ptr @.intl.n.resolved, ptr @jsIntlResolvedInvoke, i64 0)
  call void @gcRootRestore(i64 %frame)
  %r0 = insertvalue { i64, i1 } undef, i64 %ov, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
}

define i64 @jsIntlObject() {
entry:
  %cached = load i64, ptr @jsIntlObjCache
  %ready = icmp ne i64 %cached, 0
  br i1 %ready, label %ret.cached, label %build
ret.cached:
  ret i64 %cached
build:
  %frame = call i64 @gcRootSave()
  %obj = call ptr @objectNew(i64 2)
  %ov = call i64 @valueBoxObject(ptr %obj)
  call void @gcRootPush(i64 %ov)
  call void @jsAttachMethod(ptr %obj, i64 14, ptr @.intl.n.dtf, ptr @jsIntlDtfCtorInvoke, i64 2)
  store i64 %ov, ptr @jsIntlObjCache
  call void @gcRegisterGlobalRoot(ptr @jsIntlObjCache)
  call void @gcRootRestore(i64 %frame)
  ret i64 %ov
}

; --- Math global object ---

@.math.n.floor = private unnamed_addr constant [6 x i8] c"floor\00"
@.math.n.ceil = private unnamed_addr constant [5 x i8] c"ceil\00"
@.math.n.round = private unnamed_addr constant [6 x i8] c"round\00"
@.math.n.trunc = private unnamed_addr constant [6 x i8] c"trunc\00"
@.math.n.abs = private unnamed_addr constant [4 x i8] c"abs\00"
@.math.n.sqrt = private unnamed_addr constant [5 x i8] c"sqrt\00"
@.math.n.min = private unnamed_addr constant [4 x i8] c"min\00"
@.math.n.max = private unnamed_addr constant [4 x i8] c"max\00"
@.math.n.PI = private unnamed_addr constant [3 x i8] c"PI\00"
@.math.n.E = private unnamed_addr constant [2 x i8] c"E\00"

define { i64, i1 } @jsMathFloorInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %ok = icmp uge i64 %argc, 1
  br i1 %ok, label %go, label %nan
go:
  %a0 = load i64, ptr %argv
  %d = call double @valueToNumber(i64 %a0)
  %res = call double @llvm.floor.f64(double %d)
  %v = call i64 @valueBoxNumber(double %res)
  %r0 = insertvalue { i64, i1 } undef, i64 %v, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
nan:
  ret { i64, i1 } { i64 -2251799813685248, i1 false }
}

define { i64, i1 } @jsMathCeilInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %ok = icmp uge i64 %argc, 1
  br i1 %ok, label %go, label %nan
go:
  %a0 = load i64, ptr %argv
  %d = call double @valueToNumber(i64 %a0)
  %res = call double @llvm.ceil.f64(double %d)
  %v = call i64 @valueBoxNumber(double %res)
  %r0 = insertvalue { i64, i1 } undef, i64 %v, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
nan:
  ret { i64, i1 } { i64 -2251799813685248, i1 false }
}

define { i64, i1 } @jsMathRoundInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %ok = icmp uge i64 %argc, 1
  br i1 %ok, label %go, label %nan
go:
  %a0 = load i64, ptr %argv
  %d = call double @valueToNumber(i64 %a0)
  %res = call double @llvm.round.f64(double %d)
  %v = call i64 @valueBoxNumber(double %res)
  %r0 = insertvalue { i64, i1 } undef, i64 %v, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
nan:
  ret { i64, i1 } { i64 -2251799813685248, i1 false }
}

define { i64, i1 } @jsMathTruncInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %ok = icmp uge i64 %argc, 1
  br i1 %ok, label %go, label %nan
go:
  %a0 = load i64, ptr %argv
  %d = call double @valueToNumber(i64 %a0)
  %res = call double @llvm.trunc.f64(double %d)
  %v = call i64 @valueBoxNumber(double %res)
  %r0 = insertvalue { i64, i1 } undef, i64 %v, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
nan:
  ret { i64, i1 } { i64 -2251799813685248, i1 false }
}

define { i64, i1 } @jsMathAbsInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %ok = icmp uge i64 %argc, 1
  br i1 %ok, label %go, label %nan
go:
  %a0 = load i64, ptr %argv
  %d = call double @valueToNumber(i64 %a0)
  %res = call double @llvm.fabs.f64(double %d)
  %v = call i64 @valueBoxNumber(double %res)
  %r0 = insertvalue { i64, i1 } undef, i64 %v, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
nan:
  ret { i64, i1 } { i64 -2251799813685248, i1 false }
}

define { i64, i1 } @jsMathSqrtInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %ok = icmp uge i64 %argc, 1
  br i1 %ok, label %go, label %nan
go:
  %a0 = load i64, ptr %argv
  %d = call double @valueToNumber(i64 %a0)
  %res = call double @llvm.sqrt.f64(double %d)
  %v = call i64 @valueBoxNumber(double %res)
  %r0 = insertvalue { i64, i1 } undef, i64 %v, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
nan:
  ret { i64, i1 } { i64 -2251799813685248, i1 false }
}

define i64 @jsMathObject() {
entry:
  %cached = load i64, ptr @jsMathObjCache
  %ready = icmp ne i64 %cached, 0
  br i1 %ready, label %ret.cached, label %build
ret.cached:
  ret i64 %cached
build:
  %frame = call i64 @gcRootSave()
  %obj = call ptr @objectNew(i64 12)
  %ov = call i64 @valueBoxObject(ptr %obj)
  call void @gcRootPush(i64 %ov)
  call void @jsAttachMethod(ptr %obj, i64 5, ptr @.math.n.floor, ptr @jsMathFloorInvoke, i64 1)
  call void @jsAttachMethod(ptr %obj, i64 4, ptr @.math.n.ceil, ptr @jsMathCeilInvoke, i64 1)
  call void @jsAttachMethod(ptr %obj, i64 5, ptr @.math.n.round, ptr @jsMathRoundInvoke, i64 1)
  call void @jsAttachMethod(ptr %obj, i64 5, ptr @.math.n.trunc, ptr @jsMathTruncInvoke, i64 1)
  call void @jsAttachMethod(ptr %obj, i64 3, ptr @.math.n.abs, ptr @jsMathAbsInvoke, i64 1)
  call void @jsAttachMethod(ptr %obj, i64 4, ptr @.math.n.sqrt, ptr @jsMathSqrtInvoke, i64 1)
  %pi = call i64 @valueBoxNumber(double 0x400921FB54442D18)
  call void @objectSet(ptr %obj, i64 2, ptr @.math.n.PI, i64 %pi)
  %e = call i64 @valueBoxNumber(double 0x4005BF0A8B145769)
  call void @objectSet(ptr %obj, i64 1, ptr @.math.n.E, i64 %e)
  store i64 %ov, ptr @jsMathObjCache
  call void @gcRegisterGlobalRoot(ptr @jsMathObjCache)
  call void @gcRootRestore(i64 %frame)
  ret i64 %ov
}

; --- String / Number / Boolean first-class constructors & setInterval/clearInterval ---

define { i64, i1 } @jsStringCtorInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %ok = icmp uge i64 %argc, 1
  br i1 %ok, label %go, label %empty
go:
  %a0 = load i64, ptr %argv
  %s = call { ptr, i64 } @valueToString(i64 %a0)
  %sp = extractvalue { ptr, i64 } %s, 0
  %sl = extractvalue { ptr, i64 } %s, 1
  %bv = call i64 @valueCopyString(ptr %sp, i64 %sl)
  %r0 = insertvalue { i64, i1 } undef, i64 %bv, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
empty:
  %ev = call i64 @valueCopyString(ptr @.intl.v.utc, i64 0)
  %e0 = insertvalue { i64, i1 } undef, i64 %ev, 0
  %e1 = insertvalue { i64, i1 } %e0, i1 false, 1
  ret { i64, i1 } %e1
}

define { i64, i1 } @jsNumberCtorInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %ok = icmp uge i64 %argc, 1
  br i1 %ok, label %go, label %zero
go:
  %a0 = load i64, ptr %argv
  %d = call double @valueToNumber(i64 %a0)
  %v = call i64 @valueBoxNumber(double %d)
  %r0 = insertvalue { i64, i1 } undef, i64 %v, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
zero:
  %zv = call i64 @valueBoxNumber(double 0.0)
  %z0 = insertvalue { i64, i1 } undef, i64 %zv, 0
  %z1 = insertvalue { i64, i1 } %z0, i1 false, 1
  ret { i64, i1 } %z1
}

define { i64, i1 } @jsBooleanCtorInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %ok = icmp uge i64 %argc, 1
  br i1 %ok, label %go, label %ret.false
go:
  %a0 = load i64, ptr %argv
  %b = call i1 @valueTruthy(i64 %a0)
  %bv = select i1 %b, i64 9222246136947933186, i64 9222246136947933185
  %r0 = insertvalue { i64, i1 } undef, i64 %bv, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
ret.false:
  ret { i64, i1 } { i64 9222246136947933185, i1 false }
}

define i64 @jsStringConstructor() {
entry:
  %cached = load i64, ptr @jsStringCtorCache
  %ready = icmp ne i64 %cached, 0
  br i1 %ready, label %ret.cached, label %build
ret.cached:
  ret i64 %cached
build:
  %ctor = call i64 @functionObjectNew(ptr @jsStringCtorInvoke, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 1)
  store i64 %ctor, ptr @jsStringCtorCache
  call void @gcRegisterGlobalRoot(ptr @jsStringCtorCache)
  %proto = call ptr @objectNew(i64 0)
  call void @jsInstallPrototype(i64 %ctor, ptr %proto)
  ret i64 %ctor
}

define i64 @jsNumberConstructor() {
entry:
  %cached = load i64, ptr @jsNumberCtorCache
  %ready = icmp ne i64 %cached, 0
  br i1 %ready, label %ret.cached, label %build
ret.cached:
  ret i64 %cached
build:
  %ctor = call i64 @functionObjectNew(ptr @jsNumberCtorInvoke, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 1)
  store i64 %ctor, ptr @jsNumberCtorCache
  call void @gcRegisterGlobalRoot(ptr @jsNumberCtorCache)
  %proto = call ptr @objectNew(i64 0)
  call void @jsInstallPrototype(i64 %ctor, ptr %proto)
  ret i64 %ctor
}

define i64 @jsBooleanConstructor() {
entry:
  %cached = load i64, ptr @jsBooleanCtorCache
  %ready = icmp ne i64 %cached, 0
  br i1 %ready, label %ret.cached, label %build
ret.cached:
  ret i64 %cached
build:
  %ctor = call i64 @functionObjectNew(ptr @jsBooleanCtorInvoke, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 1)
  store i64 %ctor, ptr @jsBooleanCtorCache
  call void @gcRegisterGlobalRoot(ptr @jsBooleanCtorCache)
  %proto = call ptr @objectNew(i64 0)
  call void @jsInstallPrototype(i64 %ctor, ptr %proto)
  ret i64 %ctor
}

define i64 @jsSetIntervalFn() {
entry:
  %cached = load i64, ptr @jsSetIntervalCache
  %ready = icmp ne i64 %cached, 0
  br i1 %ready, label %ret.cached, label %build
ret.cached:
  ret i64 %cached
build:
  %fn = call i64 @functionObjectNew(ptr @jsSetTimeoutInvoke, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 2)
  store i64 %fn, ptr @jsSetIntervalCache
  call void @gcRegisterGlobalRoot(ptr @jsSetIntervalCache)
  ret i64 %fn
}

define i64 @jsClearIntervalFn() {
entry:
  %cached = load i64, ptr @jsClearIntervalCache
  %ready = icmp ne i64 %cached, 0
  br i1 %ready, label %ret.cached, label %build
ret.cached:
  ret i64 %cached
build:
  %fn = call i64 @functionObjectNew(ptr @jsClearTimeoutInvoke, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 1)
  store i64 %fn, ptr @jsClearIntervalCache
  call void @gcRegisterGlobalRoot(ptr @jsClearIntervalCache)
  ret i64 %fn
}

; --- BigInt-aware dynamic binary/unary arithmetic & generic JS [[Construct]] ---
; op codes for valueBinaryOp:
;  0: -, 1: *, 2: /, 3: %, 4: **, 5: &, 6: |, 7: ^, 8: <<, 9: >>, 10: >>>

define i64 @valueBinaryOp(i64 %op, i64 %left, i64 %right) {
entry:
  %l.bi = call i1 @valueIsBigInt(i64 %left)
  %r.bi = call i1 @valueIsBigInt(i64 %right)
  %both.bi = and i1 %l.bi, %r.bi
  br i1 %both.bi, label %bigint, label %number
bigint:
  %a = call i64 @bigIntToI64(i64 %left)
  %b = call i64 @bigIntToI64(i64 %right)
  switch i64 %op, label %bi.zero [
    i64 0, label %bi.sub
    i64 1, label %bi.mul
    i64 2, label %bi.div
    i64 3, label %bi.rem
    i64 4, label %bi.pow
    i64 5, label %bi.and
    i64 6, label %bi.or
    i64 7, label %bi.xor
    i64 8, label %bi.shl
    i64 9, label %bi.shr
    i64 10, label %bi.ushr
  ]
bi.sub:
  %r.sub = sub i64 %a, %b
  br label %bi.box
bi.mul:
  %r.mul = mul i64 %a, %b
  br label %bi.box
bi.div:
  %div.z = icmp eq i64 %b, 0
  %div.safe = select i1 %div.z, i64 1, i64 %b
  %div.raw = sdiv i64 %a, %div.safe
  %r.div = select i1 %div.z, i64 0, i64 %div.raw
  br label %bi.box
bi.rem:
  %rem.z = icmp eq i64 %b, 0
  %rem.safe = select i1 %rem.z, i64 1, i64 %b
  %rem.raw = srem i64 %a, %rem.safe
  %r.rem = select i1 %rem.z, i64 0, i64 %rem.raw
  br label %bi.box
bi.pow:
  %af = sitofp i64 %a to double
  %bf = sitofp i64 %b to double
  %pf = call double @llvm.pow.f64(double %af, double %bf)
  %r.pow = fptosi double %pf to i64
  br label %bi.box
bi.and:
  %r.and = and i64 %a, %b
  br label %bi.box
bi.or:
  %r.or = or i64 %a, %b
  br label %bi.box
bi.xor:
  %r.xor = xor i64 %a, %b
  br label %bi.box
bi.shl:
  %r.shl = shl i64 %a, %b
  br label %bi.box
bi.shr:
  %r.shr = ashr i64 %a, %b
  br label %bi.box
bi.ushr:
  %r.ushr = lshr i64 %a, %b
  br label %bi.box
bi.zero:
  br label %bi.box
bi.box:
  %bi.res = phi i64 [ %r.sub, %bi.sub ], [ %r.mul, %bi.mul ], [ %r.div, %bi.div ], [ %r.rem, %bi.rem ], [ %r.pow, %bi.pow ], [ %r.and, %bi.and ], [ %r.or, %bi.or ], [ %r.xor, %bi.xor ], [ %r.shl, %bi.shl ], [ %r.shr, %bi.shr ], [ %r.ushr, %bi.ushr ], [ 0, %bi.zero ]
  %bi.v = call i64 @bigIntFromI64(i64 %bi.res)
  ret i64 %bi.v
number:
  %ld = call double @valueToNumber(i64 %left)
  %rd = call double @valueToNumber(i64 %right)
  switch i64 %op, label %num.nan [
    i64 0, label %num.sub
    i64 1, label %num.mul
    i64 2, label %num.div
    i64 3, label %num.rem
    i64 4, label %num.pow
    i64 5, label %num.and
    i64 6, label %num.or
    i64 7, label %num.xor
    i64 8, label %num.shl
    i64 9, label %num.shr
    i64 10, label %num.ushr
  ]
num.sub:
  %ns = fsub double %ld, %rd
  br label %num.box
num.mul:
  %nm = fmul double %ld, %rd
  br label %num.box
num.div:
  %nd = fdiv double %ld, %rd
  br label %num.box
num.rem:
  %nr = frem double %ld, %rd
  br label %num.box
num.pow:
  %np = call double @llvm.pow.f64(double %ld, double %rd)
  br label %num.box
num.and:
  %li0 = fptosi double %ld to i32
  %ri0 = fptosi double %rd to i32
  %na0 = and i32 %li0, %ri0
  %na = sitofp i32 %na0 to double
  br label %num.box
num.or:
  %li1 = fptosi double %ld to i32
  %ri1 = fptosi double %rd to i32
  %no0 = or i32 %li1, %ri1
  %no = sitofp i32 %no0 to double
  br label %num.box
num.xor:
  %li2 = fptosi double %ld to i32
  %ri2 = fptosi double %rd to i32
  %nx0 = xor i32 %li2, %ri2
  %nx = sitofp i32 %nx0 to double
  br label %num.box
num.shl:
  %li3 = fptosi double %ld to i32
  %ri3 = fptosi double %rd to i32
  %sh3 = and i32 %ri3, 31
  %nshl0 = shl i32 %li3, %sh3
  %nshl = sitofp i32 %nshl0 to double
  br label %num.box
num.shr:
  %li4 = fptosi double %ld to i32
  %ri4 = fptosi double %rd to i32
  %sh4 = and i32 %ri4, 31
  %nshr0 = ashr i32 %li4, %sh4
  %nshr = sitofp i32 %nshr0 to double
  br label %num.box
num.ushr:
  %li5 = fptosi double %ld to i32
  %ri5 = fptosi double %rd to i32
  %sh5 = and i32 %ri5, 31
  %nushr0 = lshr i32 %li5, %sh5
  %nushr = uitofp i32 %nushr0 to double
  br label %num.box
num.nan:
  br label %num.box
num.box:
  %num.res = phi double [ %ns, %num.sub ], [ %nm, %num.mul ], [ %nd, %num.div ], [ %nr, %num.rem ], [ %np, %num.pow ], [ %na, %num.and ], [ %no, %num.or ], [ %nx, %num.xor ], [ %nshl, %num.shl ], [ %nshr, %num.shr ], [ %nushr, %num.ushr ], [ 0x7FF5000000000000, %num.nan ]
  %is.nan = fcmp uno double %num.res, %num.res
  %safe = select i1 %is.nan, double 0x7FF5000000000000, double %num.res
  %bv = call i64 @valueBoxNumber(double %safe)
  ret i64 %bv
}

define i64 @valueUnaryOp(i64 %op, i64 %val) {
entry:
  %is.bi = call i1 @valueIsBigInt(i64 %val)
  br i1 %is.bi, label %bi, label %num
bi:
  %a = call i64 @bigIntToI64(i64 %val)
  %is.neg = icmp eq i64 %op, 0
  %neg = sub i64 0, %a
  %bnot = xor i64 %a, -1
  %r = select i1 %is.neg, i64 %neg, i64 %bnot
  %bv = call i64 @bigIntFromI64(i64 %r)
  ret i64 %bv
num:
  %d = call double @valueToNumber(i64 %val)
  %is.n = icmp eq i64 %op, 0
  br i1 %is.n, label %num.neg, label %num.bnot
num.neg:
  %nd = fneg double %d
  %nv = call i64 @valueBoxNumber(double %nd)
  ret i64 %nv
num.bnot:
  %i = fptosi double %d to i32
  %ni = xor i32 %i, -1
  %nfd = sitofp i32 %ni to double
  %nbv = call i64 @valueBoxNumber(double %nfd)
  ret i64 %nbv
}

define { i64, i1 } @jsConstruct(i64 %callee, i64 %argc, ptr %argv) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %callee)
  %proto.val = call i64 @valuePropertyGet(i64 %callee, i64 9, ptr @.class.key.prototype)
  %proto.is.obj = call i1 @valueIsObject(i64 %proto.val)
  br i1 %proto.is.obj, label %check.col, label %alloc.default
check.col:
  %proto.is.col = call i1 @valueIsCollection(i64 %proto.val)
  br i1 %proto.is.col, label %alloc.default, label %alloc.proto
alloc.proto:
  %proto.ptr = call ptr @valueObjectPtr(i64 %proto.val)
  %inst.p = call ptr @objectCreate(ptr %proto.ptr)
  %inst.pv = call i64 @valueBoxObject(ptr %inst.p)
  br label %invoke
alloc.default:
  %inst.d = call ptr @objectNew(i64 0)
  %inst.dv = call i64 @valueBoxObject(ptr %inst.d)
  br label %invoke
invoke:
  %instance = phi i64 [ %inst.pv, %alloc.proto ], [ %inst.dv, %alloc.default ]
  call void @gcRootPush(i64 %instance)
  %res = call { i64, i1 } @jsCall(i64 %callee, i64 %argc, ptr %argv, i64 %instance)
  %threw = extractvalue { i64, i1 } %res, 1
  br i1 %threw, label %error, label %adopt
error:
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %res
adopt:
  %ret.v = extractvalue { i64, i1 } %res, 0
  %final.v = call i64 @newInstanceResult(i64 %instance, i64 %ret.v)
  call void @gcRootRestore(i64 %frame)
  %ok0 = insertvalue { i64, i1 } undef, i64 %final.v, 0
  %ok1 = insertvalue { i64, i1 } %ok0, i1 false, 1
  ret { i64, i1 } %ok1
}

; --- First-class Map, Set, WeakMap, WeakSet, Uint8Array, Float64Array, URL, console, JSON ---

@jsMapCtorCache = internal global i64 0
@jsSetCtorCache = internal global i64 0
@jsWeakMapCtorCache = internal global i64 0
@jsWeakSetCtorCache = internal global i64 0
@jsUint8ArrayCtorCache = internal global i64 0
@jsFloat64ArrayCtorCache = internal global i64 0
@jsURLCtorCache = internal global i64 0
@jsConsoleObjCache = internal global i64 0
@jsJsonObjCache = internal global i64 0

@.col.notiter = private unnamed_addr constant [25 x i8] c"Argument is not iterable\00"
@.url.k.href = private unnamed_addr constant [5 x i8] c"href\00"
@.url.k.protocol = private unnamed_addr constant [9 x i8] c"protocol\00"
@.url.k.pathname = private unnamed_addr constant [9 x i8] c"pathname\00"
@.url.k.toString = private unnamed_addr constant [9 x i8] c"toString\00"
@.url.k.toJSON = private unnamed_addr constant [7 x i8] c"toJSON\00"
@.url.empty = private unnamed_addr constant [1 x i8] c"\00"
@.url.http = private unnamed_addr constant [6 x i8] c"http:\00"
@.con.n.log = private unnamed_addr constant [4 x i8] c"log\00"
@.con.n.error = private unnamed_addr constant [6 x i8] c"error\00"
@.con.n.warn = private unnamed_addr constant [5 x i8] c"warn\00"
@.con.n.info = private unnamed_addr constant [5 x i8] c"info\00"
@.con.n.debug = private unnamed_addr constant [6 x i8] c"debug\00"
@.con.n.assert = private unnamed_addr constant [7 x i8] c"assert\00"
@.con.n.clear = private unnamed_addr constant [6 x i8] c"clear\00"
@.con.n.dir = private unnamed_addr constant [4 x i8] c"dir\00"
@.con.n.group = private unnamed_addr constant [6 x i8] c"group\00"
@.con.n.groupEnd = private unnamed_addr constant [9 x i8] c"groupEnd\00"
@.con.n.time = private unnamed_addr constant [5 x i8] c"time\00"
@.con.n.timeEnd = private unnamed_addr constant [8 x i8] c"timeEnd\00"
@.con.n.trace = private unnamed_addr constant [6 x i8] c"trace\00"
@.json.n.parse = private unnamed_addr constant [6 x i8] c"parse\00"
@.json.n.stringify = private unnamed_addr constant [10 x i8] c"stringify\00"

define { i64, i1 } @jsCollectionCtorHelper(i64 %kind, i64 %argc, ptr %argv) {
entry:
  %has0 = icmp uge i64 %argc, 1
  br i1 %has0, label %check0, label %empty
check0:
  %a0 = load i64, ptr %argv
  %is.undef = icmp eq i64 %a0, 9222246136947933184
  %is.null = icmp eq i64 %a0, 9222246136947933187
  %is.nil = or i1 %is.undef, %is.null
  br i1 %is.nil, label %empty, label %from.iter
from.iter:
  %msg = call i64 @valueBoxString(ptr @.col.notiter, i64 24)
  %res = call { i64, i1 } @collectionFromIterableWithKind(i64 %a0, i64 %msg, i64 %kind)
  ret { i64, i1 } %res
empty:
  %ptr = call ptr @collectionNewWithKind(i64 %kind)
  %v = call i64 @valueBoxObject(ptr %ptr)
  %r0 = insertvalue { i64, i1 } undef, i64 %v, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
}

define { i64, i1 } @jsMapCtorInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %r = call { i64, i1 } @jsCollectionCtorHelper(i64 0, i64 %argc, ptr %argv)
  ret { i64, i1 } %r
}

define { i64, i1 } @jsSetCtorInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %r = call { i64, i1 } @jsCollectionCtorHelper(i64 1, i64 %argc, ptr %argv)
  ret { i64, i1 } %r
}

define { i64, i1 } @jsWeakMapCtorInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %r = call { i64, i1 } @jsCollectionCtorHelper(i64 2, i64 %argc, ptr %argv)
  ret { i64, i1 } %r
}

define { i64, i1 } @jsWeakSetCtorInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %r = call { i64, i1 } @jsCollectionCtorHelper(i64 3, i64 %argc, ptr %argv)
  ret { i64, i1 } %r
}

define i64 @jsMapConstructor() {
entry:
  %cached = load i64, ptr @jsMapCtorCache
  %ready = icmp ne i64 %cached, 0
  br i1 %ready, label %ret.cached, label %build
ret.cached:
  ret i64 %cached
build:
  %ctor = call i64 @functionObjectNew(ptr @jsMapCtorInvoke, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 0)
  store i64 %ctor, ptr @jsMapCtorCache
  call void @gcRegisterGlobalRoot(ptr @jsMapCtorCache)
  %proto = call ptr @objectNew(i64 0)
  call void @jsInstallPrototype(i64 %ctor, ptr %proto)
  ret i64 %ctor
}

define i64 @jsSetConstructor() {
entry:
  %cached = load i64, ptr @jsSetCtorCache
  %ready = icmp ne i64 %cached, 0
  br i1 %ready, label %ret.cached, label %build
ret.cached:
  ret i64 %cached
build:
  %ctor = call i64 @functionObjectNew(ptr @jsSetCtorInvoke, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 0)
  store i64 %ctor, ptr @jsSetCtorCache
  call void @gcRegisterGlobalRoot(ptr @jsSetCtorCache)
  %proto = call ptr @objectNew(i64 0)
  call void @jsInstallPrototype(i64 %ctor, ptr %proto)
  ret i64 %ctor
}

define i64 @jsWeakMapConstructor() {
entry:
  %cached = load i64, ptr @jsWeakMapCtorCache
  %ready = icmp ne i64 %cached, 0
  br i1 %ready, label %ret.cached, label %build
ret.cached:
  ret i64 %cached
build:
  %ctor = call i64 @functionObjectNew(ptr @jsWeakMapCtorInvoke, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 0)
  store i64 %ctor, ptr @jsWeakMapCtorCache
  call void @gcRegisterGlobalRoot(ptr @jsWeakMapCtorCache)
  %proto = call ptr @objectNew(i64 0)
  call void @jsInstallPrototype(i64 %ctor, ptr %proto)
  ret i64 %ctor
}

define i64 @jsWeakSetConstructor() {
entry:
  %cached = load i64, ptr @jsWeakSetCtorCache
  %ready = icmp ne i64 %cached, 0
  br i1 %ready, label %ret.cached, label %build
ret.cached:
  ret i64 %cached
build:
  %ctor = call i64 @functionObjectNew(ptr @jsWeakSetCtorInvoke, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 0)
  store i64 %ctor, ptr @jsWeakSetCtorCache
  call void @gcRegisterGlobalRoot(ptr @jsWeakSetCtorCache)
  %proto = call ptr @objectNew(i64 0)
  call void @jsInstallPrototype(i64 %ctor, ptr %proto)
  ret i64 %ctor
}

define i64 @jsUint8ArrayConstructor() {
entry:
  %cached = load i64, ptr @jsUint8ArrayCtorCache
  %ready = icmp ne i64 %cached, 0
  br i1 %ready, label %ret.cached, label %build
ret.cached:
  ret i64 %cached
build:
  %ctor = call i64 @functionObjectNew(ptr @jsTypedArrayCtorInvoke, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 1)
  store i64 %ctor, ptr @jsUint8ArrayCtorCache
  call void @gcRegisterGlobalRoot(ptr @jsUint8ArrayCtorCache)
  %proto = call ptr @objectNew(i64 0)
  call void @jsInstallPrototype(i64 %ctor, ptr %proto)
  ret i64 %ctor
}

define i64 @jsFloat64ArrayConstructor() {
entry:
  %cached = load i64, ptr @jsFloat64ArrayCtorCache
  %ready = icmp ne i64 %cached, 0
  br i1 %ready, label %ret.cached, label %build
ret.cached:
  ret i64 %cached
build:
  %ctor = call i64 @functionObjectNew(ptr @jsTypedArrayCtorInvoke, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 1)
  store i64 %ctor, ptr @jsFloat64ArrayCtorCache
  call void @gcRegisterGlobalRoot(ptr @jsFloat64ArrayCtorCache)
  %proto = call ptr @objectNew(i64 0)
  call void @jsInstallPrototype(i64 %ctor, ptr %proto)
  ret i64 %ctor
}

define { i64, i1 } @jsURLToStringInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %href = call i64 @valuePropertyGet(i64 %this.val, i64 4, ptr @.url.k.href)
  %r0 = insertvalue { i64, i1 } undef, i64 %href, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
}

; Gives a builtin constructor the `prototype` that `instanceof` and `new` read.
define void @jsInstallPrototype(i64 %ctor, ptr %prototype) {
entry:
  %value = call i64 @valueBoxObject(ptr %prototype)
  %stored = call { i64, i1 } @functionObjectSet(i64 %ctor, i64 9, ptr @.obj.n.prototype, i64 %value)
  ret void
}

; A builtin's result inherits from the receiver `new` allocated for it.
define void @jsAdoptPrototype(ptr %object, i64 %receiver) {
entry:
  %is.object = call i1 @valueIsPlainObject(i64 %receiver)
  br i1 %is.object, label %adopt, label %done
adopt:
  %receiver.ptr = call ptr @valueObjectPtr(i64 %receiver)
  %prototype = call ptr @objectGetPrototype(ptr %receiver.ptr)
  call void @objectSetPrototype(ptr %object, ptr %prototype)
  br label %done
done:
  ret void
}

define { i64, i1 } @jsURLCtorInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %frame = call i64 @gcRootSave()
  %obj = call ptr @objectNew(i64 6)
  %ov = call i64 @valueBoxObject(ptr %obj)
  call void @gcRootPush(i64 %ov)
  call void @jsAdoptPrototype(ptr %obj, i64 %this.val)
  %has0 = icmp uge i64 %argc, 1
  br i1 %has0, label %read0, label %empty.href
read0:
  %a0 = load i64, ptr %argv
  %s = call { ptr, i64 } @valueToString(i64 %a0)
  %sp = extractvalue { ptr, i64 } %s, 0
  %sl = extractvalue { ptr, i64 } %s, 1
  %hv = call i64 @valueCopyString(ptr %sp, i64 %sl)
  br label %fill
empty.href:
  %ehv = call i64 @valueBoxString(ptr @.url.empty, i64 0)
  br label %fill
fill:
  %href = phi i64 [ %hv, %read0 ], [ %ehv, %empty.href ]
  call void @objectSet(ptr %obj, i64 4, ptr @.url.k.href, i64 %href)
  %proto.s = call i64 @valueBoxString(ptr @.url.http, i64 5)
  call void @objectSet(ptr %obj, i64 8, ptr @.url.k.protocol, i64 %proto.s)
  call void @objectSet(ptr %obj, i64 8, ptr @.url.k.pathname, i64 %href)
  call void @jsAttachMethod(ptr %obj, i64 8, ptr @.url.k.toString, ptr @jsURLToStringInvoke, i64 0)
  call void @jsAttachMethod(ptr %obj, i64 6, ptr @.url.k.toJSON, ptr @jsURLToStringInvoke, i64 0)
  call void @gcRootRestore(i64 %frame)
  %r0 = insertvalue { i64, i1 } undef, i64 %ov, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
}

define i64 @jsURLConstructor() {
entry:
  %cached = load i64, ptr @jsURLCtorCache
  %ready = icmp ne i64 %cached, 0
  br i1 %ready, label %ret.cached, label %build
ret.cached:
  ret i64 %cached
build:
  %ctor = call i64 @functionObjectNew(ptr @jsURLCtorInvoke, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 1)
  store i64 %ctor, ptr @jsURLCtorCache
  call void @gcRegisterGlobalRoot(ptr @jsURLCtorCache)
  %proto = call ptr @objectNew(i64 0)
  call void @jsInstallPrototype(i64 %ctor, ptr %proto)
  ret i64 %ctor
}

define { i64, i1 } @jsConsoleLogInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  call void @valueConsoleLog(i64 %argc, ptr %argv)
  ret { i64, i1 } { i64 9222246136947933184, i1 false }
}

define { i64, i1 } @jsConsoleErrorInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  call void @valueConsoleError(i64 %argc, ptr %argv)
  ret { i64, i1 } { i64 9222246136947933184, i1 false }
}

define { i64, i1 } @jsConsoleAssertInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %has0 = icmp uge i64 %argc, 1
  br i1 %has0, label %check, label %done
check:
  %c = load i64, ptr %argv
  %ok = call i1 @valueTruthy(i64 %c)
  br i1 %ok, label %done, label %fail
fail:
  %rest.n = sub i64 %argc, 1
  %rest.p = getelementptr i64, ptr %argv, i64 1
  call void @valueConsoleError(i64 %rest.n, ptr %rest.p)
  br label %done
done:
  ret { i64, i1 } { i64 9222246136947933184, i1 false }
}

define { i64, i1 } @jsConsoleNoopInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  ret { i64, i1 } { i64 9222246136947933184, i1 false }
}

define i64 @jsConsoleObject() {
entry:
  %cached = load i64, ptr @jsConsoleObjCache
  %ready = icmp ne i64 %cached, 0
  br i1 %ready, label %ret.cached, label %build
ret.cached:
  ret i64 %cached
build:
  %frame = call i64 @gcRootSave()
  %obj = call ptr @objectNew(i64 16)
  %ov = call i64 @valueBoxObject(ptr %obj)
  call void @gcRootPush(i64 %ov)
  call void @jsAttachMethod(ptr %obj, i64 3, ptr @.con.n.log, ptr @jsConsoleLogInvoke, i64 0)
  call void @jsAttachMethod(ptr %obj, i64 5, ptr @.con.n.error, ptr @jsConsoleErrorInvoke, i64 0)
  call void @jsAttachMethod(ptr %obj, i64 4, ptr @.con.n.warn, ptr @jsConsoleErrorInvoke, i64 0)
  call void @jsAttachMethod(ptr %obj, i64 4, ptr @.con.n.info, ptr @jsConsoleLogInvoke, i64 0)
  call void @jsAttachMethod(ptr %obj, i64 5, ptr @.con.n.debug, ptr @jsConsoleLogInvoke, i64 0)
  call void @jsAttachMethod(ptr %obj, i64 6, ptr @.con.n.assert, ptr @jsConsoleAssertInvoke, i64 1)
  call void @jsAttachMethod(ptr %obj, i64 5, ptr @.con.n.clear, ptr @jsConsoleNoopInvoke, i64 0)
  call void @jsAttachMethod(ptr %obj, i64 3, ptr @.con.n.dir, ptr @jsConsoleLogInvoke, i64 1)
  call void @jsAttachMethod(ptr %obj, i64 5, ptr @.con.n.group, ptr @jsConsoleNoopInvoke, i64 0)
  call void @jsAttachMethod(ptr %obj, i64 8, ptr @.con.n.groupEnd, ptr @jsConsoleNoopInvoke, i64 0)
  call void @jsAttachMethod(ptr %obj, i64 4, ptr @.con.n.time, ptr @jsConsoleNoopInvoke, i64 0)
  call void @jsAttachMethod(ptr %obj, i64 7, ptr @.con.n.timeEnd, ptr @jsConsoleNoopInvoke, i64 0)
  call void @jsAttachMethod(ptr %obj, i64 5, ptr @.con.n.trace, ptr @jsConsoleErrorInvoke, i64 0)
  store i64 %ov, ptr @jsConsoleObjCache
  call void @gcRegisterGlobalRoot(ptr @jsConsoleObjCache)
  call void @gcRootRestore(i64 %frame)
  ret i64 %ov
}

define { i64, i1 } @jsJsonParseInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %has0 = icmp uge i64 %argc, 1
  br i1 %has0, label %go, label %undef
go:
  %a0 = load i64, ptr %argv
  %has1 = icmp uge i64 %argc, 2
  br i1 %has1, label %with.rev, label %no.rev
with.rev:
  %s1 = getelementptr i64, ptr %argv, i64 1
  %a1 = load i64, ptr %s1
  %r1 = call { i64, i1 } @jsonParse(i64 %a0, i64 %a1)
  ret { i64, i1 } %r1
no.rev:
  %r0 = call { i64, i1 } @jsonParse(i64 %a0, i64 9222246136947933184)
  ret { i64, i1 } %r0
undef:
  ret { i64, i1 } { i64 9222246136947933184, i1 false }
}

define { i64, i1 } @jsJsonStringifyInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %has0 = icmp uge i64 %argc, 1
  br i1 %has0, label %go, label %undef
go:
  %a0 = load i64, ptr %argv
  %has2 = icmp uge i64 %argc, 3
  br i1 %has2, label %read.indent, label %do.call
read.indent:
  %s2 = getelementptr i64, ptr %argv, i64 2
  %a2 = load i64, ptr %s2
  %d2 = call double @valueToNumber(i64 %a2)
  %is.nan = fcmp uno double %d2, %d2
  %safe.d = select i1 %is.nan, double 0.0, double %d2
  %i2 = fptosi double %safe.d to i64
  %neg = icmp slt i64 %i2, 0
  %cl0 = select i1 %neg, i64 0, i64 %i2
  %big = icmp sgt i64 %cl0, 10
  %cl1 = select i1 %big, i64 10, i64 %cl0
  br label %do.call
do.call:
  %indent = phi i64 [ 0, %go ], [ %cl1, %read.indent ]
  %res = call { i64, i1 } @jsonStringify(i64 %a0, ptr null, i64 %indent)
  ret { i64, i1 } %res
undef:
  ret { i64, i1 } { i64 9222246136947933184, i1 false }
}

define i64 @jsJsonObject() {
entry:
  %cached = load i64, ptr @jsJsonObjCache
  %ready = icmp ne i64 %cached, 0
  br i1 %ready, label %ret.cached, label %build
ret.cached:
  ret i64 %cached
build:
  %frame = call i64 @gcRootSave()
  %obj = call ptr @objectNew(i64 4)
  %ov = call i64 @valueBoxObject(ptr %obj)
  call void @gcRootPush(i64 %ov)
  call void @jsAttachMethod(ptr %obj, i64 5, ptr @.json.n.parse, ptr @jsJsonParseInvoke, i64 2)
  call void @jsAttachMethod(ptr %obj, i64 9, ptr @.json.n.stringify, ptr @jsJsonStringifyInvoke, i64 3)
  store i64 %ov, ptr @jsJsonObjCache
  call void @gcRegisterGlobalRoot(ptr @jsJsonObjCache)
  call void @gcRootRestore(i64 %frame)
  ret i64 %ov
}

define i1 @jsCollectionInstanceOf(i64 %left, i64 %right) {
entry:
  %col = call ptr @valueObjectPtr(i64 %left)
  %kind = call i64 @collectionKind(ptr %col)
  %is.map = icmp eq i64 %kind, 0
  br i1 %is.map, label %map, label %check.set
map:
  %mc = load i64, ptr @jsMapCtorCache
  %m = icmp eq i64 %right, %mc
  ret i1 %m
check.set:
  %is.set = icmp eq i64 %kind, 1
  br i1 %is.set, label %set, label %check.wm
set:
  %sc = load i64, ptr @jsSetCtorCache
  %s = icmp eq i64 %right, %sc
  ret i1 %s
check.wm:
  %is.wm = icmp eq i64 %kind, 2
  br i1 %is.wm, label %wm, label %ws
wm:
  %wmc = load i64, ptr @jsWeakMapCtorCache
  %w = icmp eq i64 %right, %wmc
  ret i1 %w
ws:
  %wsc = load i64, ptr @jsWeakSetCtorCache
  %wsr = icmp eq i64 %right, %wsc
  ret i1 %wsr
}
