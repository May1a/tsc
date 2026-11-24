; First-class Symbol runtime (NaN-box tag 0x7FFD_0000_0000_0000 = 9222527611924643840)
; plus general boxed Object, Reflect, Array, performance, setTimeout/clearTimeout, and globalThis.

@.sym.wk.1  = private unnamed_addr constant [19 x i8] c"\EF\A3\BFSymbol.iterator\00"
@.sym.wk.2  = private unnamed_addr constant [24 x i8] c"\EF\A3\BFSymbol.asyncIterator\00"
@.sym.wk.3  = private unnamed_addr constant [22 x i8] c"\EF\A3\BFSymbol.hasInstance\00"
@.sym.wk.4  = private unnamed_addr constant [22 x i8] c"\EF\A3\BFSymbol.toStringTag\00"
@.sym.wk.5  = private unnamed_addr constant [22 x i8] c"\EF\A3\BFSymbol.toPrimitive\00"
@.sym.wk.6  = private unnamed_addr constant [18 x i8] c"\EF\A3\BFSymbol.species\00"
@.sym.wk.7  = private unnamed_addr constant [29 x i8] c"\EF\A3\BFSymbol.isConcatSpreadable\00"
@.sym.wk.8  = private unnamed_addr constant [16 x i8] c"\EF\A3\BFSymbol.match\00"
@.sym.wk.9  = private unnamed_addr constant [18 x i8] c"\EF\A3\BFSymbol.replace\00"
@.sym.wk.10 = private unnamed_addr constant [17 x i8] c"\EF\A3\BFSymbol.search\00"
@.sym.wk.11 = private unnamed_addr constant [16 x i8] c"\EF\A3\BFSymbol.split\00"
@.sym.wk.12 = private unnamed_addr constant [22 x i8] c"\EF\A3\BFSymbol.unscopables\00"
@.sym.wk.13 = private unnamed_addr constant [18 x i8] c"\EF\A3\BFSymbol.dispose\00"
@.sym.wk.14 = private unnamed_addr constant [23 x i8] c"\EF\A3\BFSymbol.asyncDispose\00"

@symbolWellKnownKeys = private unnamed_addr constant [14 x { ptr, i64 }] [
  { ptr, i64 } { ptr @.sym.wk.1,  i64 18 },
  { ptr, i64 } { ptr @.sym.wk.2,  i64 23 },
  { ptr, i64 } { ptr @.sym.wk.3,  i64 21 },
  { ptr, i64 } { ptr @.sym.wk.4,  i64 21 },
  { ptr, i64 } { ptr @.sym.wk.5,  i64 21 },
  { ptr, i64 } { ptr @.sym.wk.6,  i64 17 },
  { ptr, i64 } { ptr @.sym.wk.7,  i64 28 },
  { ptr, i64 } { ptr @.sym.wk.8,  i64 15 },
  { ptr, i64 } { ptr @.sym.wk.9,  i64 17 },
  { ptr, i64 } { ptr @.sym.wk.10, i64 16 },
  { ptr, i64 } { ptr @.sym.wk.11, i64 15 },
  { ptr, i64 } { ptr @.sym.wk.12, i64 21 },
  { ptr, i64 } { ptr @.sym.wk.13, i64 17 },
  { ptr, i64 } { ptr @.sym.wk.14, i64 22 }
]

; Dynamic symbol metadata table indexed by (id - 16).
; Each entry is 24 bytes: { ptr descPtr, i64 descLen, i64 hasDesc }.
@symbolNextId = internal global i64 16
@symbolMetaTable = internal global ptr null
@symbolMetaCap = internal global i64 0

; Global Symbol.for registry: array of 24-byte entries { ptr keyPtr, i64 keyLen, i64 symId }.
@symbolRegTable = internal global ptr null
@symbolRegCount = internal global i64 0
@symbolRegCap = internal global i64 0

; Lazy cached global singletons (zero startup allocations).
@symbolCtorCache = internal global i64 0
@jsObjectCtorCache = internal global i64 0
@jsReflectObjCache = internal global i64 0
@jsArrayCtorCache = internal global i64 0
@jsArrayProtoObjCache = internal global i64 0
@jsPerfObjCache = internal global i64 0
@jsSetTimeoutCache = internal global i64 0
@jsClearTimeoutCache = internal global i64 0
@jsGlobalThisCache = internal global i64 0
@jsTimerNextId = internal global i64 1

@.sym.fmt.key = private unnamed_addr constant [9 x i8] c"\EF\A3\BF#%lld\00"
@.sym.prefix = private unnamed_addr constant [8 x i8] c"Symbol(\00"
@.sym.empty = private unnamed_addr constant [9 x i8] c"Symbol()\00"
@.sym.name.Symbol = private unnamed_addr constant [7 x i8] c"Symbol\00"
@.sym.name.for = private unnamed_addr constant [4 x i8] c"for\00"
@.sym.name.keyFor = private unnamed_addr constant [7 x i8] c"keyFor\00"
@.sym.name.description = private unnamed_addr constant [12 x i8] c"description\00"
@.sym.name.toString = private unnamed_addr constant [9 x i8] c"toString\00"
@.sym.name.valueOf = private unnamed_addr constant [8 x i8] c"valueOf\00"

define i1 @valueIsSymbol(i64 %value) {
entry:
  %tag = and i64 %value, -281474976710656
  %is.sym = icmp eq i64 %tag, 9222527611924643840
  ret i1 %is.sym
}

define i1 @isSymbolPropertyKey(ptr %key.ptr, i64 %key.len) {
entry:
  %long.enough = icmp uge i64 %key.len, 3
  br i1 %long.enough, label %check.0, label %no
check.0:
  %b0 = load i8, ptr %key.ptr
  %m0 = icmp eq i8 %b0, -17
  br i1 %m0, label %check.1, label %no
check.1:
  %p1 = getelementptr i8, ptr %key.ptr, i64 1
  %b1 = load i8, ptr %p1
  %m1 = icmp eq i8 %b1, -93
  br i1 %m1, label %check.2, label %no
check.2:
  %p2 = getelementptr i8, ptr %key.ptr, i64 2
  %b2 = load i8, ptr %p2
  %m2 = icmp eq i8 %b2, -65
  ret i1 %m2
no:
  ret i1 false
}

define i64 @symbolCreateRaw(i1 %has.desc, ptr %desc.ptr, i64 %desc.len) {
entry:
  %id = load i64, ptr @symbolNextId
  %next = add i64 %id, 1
  store i64 %next, ptr @symbolNextId
  %idx = sub i64 %id, 16
  %cap = load i64, ptr @symbolMetaCap
  %need.grow = icmp uge i64 %idx, %cap
  br i1 %need.grow, label %grow, label %store.meta
grow:
  %is.zero = icmp eq i64 %cap, 0
  %doubled = mul i64 %cap, 2
  %new.cap = select i1 %is.zero, i64 64, i64 %doubled
  %new.bytes = mul i64 %new.cap, 24
  %old.tbl = load ptr, ptr @symbolMetaTable
  %new.tbl = call ptr @realloc(ptr %old.tbl, i64 %new.bytes)
  store ptr %new.tbl, ptr @symbolMetaTable
  store i64 %new.cap, ptr @symbolMetaCap
  br label %store.meta
store.meta:
  %tbl = load ptr, ptr @symbolMetaTable
  %off = mul i64 %idx, 24
  %slot = getelementptr i8, ptr %tbl, i64 %off
  br i1 %has.desc, label %copy.desc, label %no.desc
copy.desc:
  %alloc.len = add i64 %desc.len, 1
  %buf = call ptr @malloc(i64 %alloc.len)
  %has.bytes = icmp ne i64 %desc.len, 0
  br i1 %has.bytes, label %do.copy, label %finish.copy
do.copy:
  call ptr @memcpy(ptr %buf, ptr %desc.ptr, i64 %desc.len)
  br label %finish.copy
finish.copy:
  %nul = getelementptr i8, ptr %buf, i64 %desc.len
  store i8 0, ptr %nul
  store ptr %buf, ptr %slot
  %len.slot = getelementptr i8, ptr %slot, i64 8
  store i64 %desc.len, ptr %len.slot
  %flag.slot = getelementptr i8, ptr %slot, i64 16
  store i64 1, ptr %flag.slot
  br label %done
no.desc:
  store ptr null, ptr %slot
  %len.slot.n = getelementptr i8, ptr %slot, i64 8
  store i64 0, ptr %len.slot.n
  %flag.slot.n = getelementptr i8, ptr %slot, i64 16
  store i64 0, ptr %flag.slot.n
  br label %done
done:
  %tagged = or i64 %id, 9222527611924643840
  ret i64 %tagged
}

define i64 @symbolCreate(i64 %desc.val) {
entry:
  %is.undef = icmp eq i64 %desc.val, 9222246136947933184
  br i1 %is.undef, label %no.desc, label %with.desc
no.desc:
  %s0 = call i64 @symbolCreateRaw(i1 false, ptr null, i64 0)
  ret i64 %s0
with.desc:
  %str = call { ptr, i64 } @valueToString(i64 %desc.val)
  %sp = extractvalue { ptr, i64 } %str, 0
  %sl = extractvalue { ptr, i64 } %str, 1
  %s1 = call i64 @symbolCreateRaw(i1 true, ptr %sp, i64 %sl)
  ret i64 %s1
}

define i64 @symbolFor(i64 %key.val) {
entry:
  %str = call { ptr, i64 } @valueToString(i64 %key.val)
  %kp = extractvalue { ptr, i64 } %str, 0
  %kl = extractvalue { ptr, i64 } %str, 1
  %count = load i64, ptr @symbolRegCount
  %tbl = load ptr, ptr @symbolRegTable
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %cont ]
  %done = icmp eq i64 %i, %count
  br i1 %done, label %insert, label %check
check:
  %off = mul i64 %i, 24
  %ep = getelementptr i8, ptr %tbl, i64 %off
  %el.slot = getelementptr i8, ptr %ep, i64 8
  %el = load i64, ptr %el.slot
  %same.len = icmp eq i64 %el, %kl
  br i1 %same.len, label %cmp.bytes, label %cont
cmp.bytes:
  %ek = load ptr, ptr %ep
  %eq = call i32 @memcmp(ptr %ek, ptr %kp, i64 %kl)
  %hit = icmp eq i32 %eq, 0
  br i1 %hit, label %found, label %cont
found:
  %id.slot = getelementptr i8, ptr %ep, i64 16
  %found.id = load i64, ptr %id.slot
  %found.sym = or i64 %found.id, 9222527611924643840
  ret i64 %found.sym
cont:
  %next = add i64 %i, 1
  br label %scan
insert:
  %new.sym = call i64 @symbolCreateRaw(i1 true, ptr %kp, i64 %kl)
  %new.id = and i64 %new.sym, 281474976710655
  %cap = load i64, ptr @symbolRegCap
  %need.grow = icmp eq i64 %count, %cap
  br i1 %need.grow, label %grow, label %write
grow:
  %is.zero = icmp eq i64 %cap, 0
  %doubled = mul i64 %cap, 2
  %new.cap = select i1 %is.zero, i64 64, i64 %doubled
  %new.bytes = mul i64 %new.cap, 24
  %new.tbl = call ptr @realloc(ptr %tbl, i64 %new.bytes)
  store ptr %new.tbl, ptr @symbolRegTable
  store i64 %new.cap, ptr @symbolRegCap
  br label %write
write:
  %wtbl = load ptr, ptr @symbolRegTable
  %woff = mul i64 %count, 24
  %wep = getelementptr i8, ptr %wtbl, i64 %woff
  %kbuf.sz = add i64 %kl, 1
  %kbuf = call ptr @malloc(i64 %kbuf.sz)
  %has.b = icmp ne i64 %kl, 0
  br i1 %has.b, label %copy.k, label %store.k
copy.k:
  call ptr @memcpy(ptr %kbuf, ptr %kp, i64 %kl)
  br label %store.k
store.k:
  %knul = getelementptr i8, ptr %kbuf, i64 %kl
  store i8 0, ptr %knul
  store ptr %kbuf, ptr %wep
  %wlen = getelementptr i8, ptr %wep, i64 8
  store i64 %kl, ptr %wlen
  %wid = getelementptr i8, ptr %wep, i64 16
  store i64 %new.id, ptr %wid
  %next.cnt = add i64 %count, 1
  store i64 %next.cnt, ptr @symbolRegCount
  ret i64 %new.sym
}

define i64 @symbolKeyFor(i64 %sym.val) {
entry:
  %is.sym = call i1 @valueIsSymbol(i64 %sym.val)
  br i1 %is.sym, label %search, label %undef
search:
  %target.id = and i64 %sym.val, 281474976710655
  %count = load i64, ptr @symbolRegCount
  %tbl = load ptr, ptr @symbolRegTable
  br label %scan
scan:
  %i = phi i64 [ 0, %search ], [ %next, %cont ]
  %done = icmp eq i64 %i, %count
  br i1 %done, label %undef, label %check
check:
  %off = mul i64 %i, 24
  %ep = getelementptr i8, ptr %tbl, i64 %off
  %id.slot = getelementptr i8, ptr %ep, i64 16
  %eid = load i64, ptr %id.slot
  %hit = icmp eq i64 %eid, %target.id
  br i1 %hit, label %found, label %cont
found:
  %ek = load ptr, ptr %ep
  %el.slot = getelementptr i8, ptr %ep, i64 8
  %el = load i64, ptr %el.slot
  %boxed = call i64 @valueCopyString(ptr %ek, i64 %el)
  ret i64 %boxed
cont:
  %next = add i64 %i, 1
  br label %scan
undef:
  ret i64 9222246136947933184
}

define i64 @symbolDescription(i64 %sym.val) {
entry:
  %id = and i64 %sym.val, 281474976710655
  %is.wk.hi = icmp ule i64 %id, 14
  %is.wk.lo = icmp uge i64 %id, 1
  %is.wk = and i1 %is.wk.lo, %is.wk.hi
  br i1 %is.wk, label %wellknown, label %dynamic
wellknown:
  %widx = sub i64 %id, 1
  %kp.slot = getelementptr [14 x { ptr, i64 }], ptr @symbolWellKnownKeys, i64 0, i64 %widx, i32 0
  %kl.slot = getelementptr [14 x { ptr, i64 }], ptr @symbolWellKnownKeys, i64 0, i64 %widx, i32 1
  %kp = load ptr, ptr %kp.slot
  %kl = load i64, ptr %kl.slot
  %dp = getelementptr i8, ptr %kp, i64 3
  %dl = sub i64 %kl, 3
  %boxed.wk = call i64 @valueCopyString(ptr %dp, i64 %dl)
  ret i64 %boxed.wk
dynamic:
  %is.dyn = icmp uge i64 %id, 16
  br i1 %is.dyn, label %lookup, label %undef
lookup:
  %idx = sub i64 %id, 16
  %cap = load i64, ptr @symbolMetaCap
  %in.range = icmp ult i64 %idx, %cap
  br i1 %in.range, label %read.meta, label %undef
read.meta:
  %tbl = load ptr, ptr @symbolMetaTable
  %off = mul i64 %idx, 24
  %slot = getelementptr i8, ptr %tbl, i64 %off
  %flag.slot = getelementptr i8, ptr %slot, i64 16
  %flag = load i64, ptr %flag.slot
  %has.desc = icmp ne i64 %flag, 0
  br i1 %has.desc, label %ret.desc, label %undef
ret.desc:
  %desc.p = load ptr, ptr %slot
  %len.slot = getelementptr i8, ptr %slot, i64 8
  %desc.l = load i64, ptr %len.slot
  %boxed = call i64 @valueCopyString(ptr %desc.p, i64 %desc.l)
  ret i64 %boxed
undef:
  ret i64 9222246136947933184
}

define { ptr, i64 } @symbolToString(i64 %sym.val) {
entry:
  %desc = call i64 @symbolDescription(i64 %sym.val)
  %is.undef = icmp eq i64 %desc, 9222246136947933184
  br i1 %is.undef, label %empty, label %with.desc
empty:
  ret { ptr, i64 } { ptr @.sym.empty, i64 8 }
with.desc:
  %dp = call ptr @valueStringPtr(i64 %desc)
  %dl = call i64 @valueStringLength(i64 %desc)
  %total = add i64 %dl, 8
  %alloc = add i64 %total, 1
  %buf = call ptr @malloc(i64 %alloc)
  call ptr @memcpy(ptr %buf, ptr @.sym.prefix, i64 7)
  %dst = getelementptr i8, ptr %buf, i64 7
  %has.d = icmp ne i64 %dl, 0
  br i1 %has.d, label %copy.d, label %close
copy.d:
  call ptr @memcpy(ptr %dst, ptr %dp, i64 %dl)
  br label %close
close:
  %rp.pos = add i64 %dl, 7
  %rp = getelementptr i8, ptr %buf, i64 %rp.pos
  store i8 41, ptr %rp
  %nul = getelementptr i8, ptr %buf, i64 %total
  store i8 0, ptr %nul
  %r0 = insertvalue { ptr, i64 } undef, ptr %buf, 0
  %r1 = insertvalue { ptr, i64 } %r0, i64 %total, 1
  ret { ptr, i64 } %r1
}

define { ptr, i64 } @symbolPropertyKey(i64 %sym.val) {
entry:
  %id = and i64 %sym.val, 281474976710655
  %is.wk.hi = icmp ule i64 %id, 14
  %is.wk.lo = icmp uge i64 %id, 1
  %is.wk = and i1 %is.wk.lo, %is.wk.hi
  br i1 %is.wk, label %wellknown, label %dynamic
wellknown:
  %widx = sub i64 %id, 1
  %kp.slot = getelementptr [14 x { ptr, i64 }], ptr @symbolWellKnownKeys, i64 0, i64 %widx, i32 0
  %kl.slot = getelementptr [14 x { ptr, i64 }], ptr @symbolWellKnownKeys, i64 0, i64 %widx, i32 1
  %kp = load ptr, ptr %kp.slot
  %kl = load i64, ptr %kl.slot
  %r0 = insertvalue { ptr, i64 } undef, ptr %kp, 0
  %r1 = insertvalue { ptr, i64 } %r0, i64 %kl, 1
  ret { ptr, i64 } %r1
dynamic:
  %buf = call ptr @malloc(i64 32)
  %n = call i32 (ptr, ptr, ...) @sprintf(ptr %buf, ptr @.sym.fmt.key, i64 %id)
  %n64 = sext i32 %n to i64
  %d0 = insertvalue { ptr, i64 } undef, ptr %buf, 0
  %d1 = insertvalue { ptr, i64 } %d0, i64 %n64, 1
  ret { ptr, i64 } %d1
}

define { ptr, i64 } @valueToPropertyKey(i64 %value) {
entry:
  %is.sym = call i1 @valueIsSymbol(i64 %value)
  br i1 %is.sym, label %sym, label %str
sym:
  %sk = call { ptr, i64 } @symbolPropertyKey(i64 %value)
  ret { ptr, i64 } %sk
str:
  %s = call { ptr, i64 } @valueToString(i64 %value)
  ret { ptr, i64 } %s
}

; ToPropertyKey as a string value: a symbol's key, or the value converted observably.
define { i64, i1 } @valueToPropertyKeyObservable(i64 %value) {
entry:
  %is.symbol = call i1 @valueIsSymbol(i64 %value)
  br i1 %is.symbol, label %symbol, label %convert
symbol:
  %key = call { ptr, i64 } @symbolPropertyKey(i64 %value)
  %key.ptr = extractvalue { ptr, i64 } %key, 0
  %key.len = extractvalue { ptr, i64 } %key, 1
  %boxed = call i64 @valueCopyString(ptr %key.ptr, i64 %key.len)
  %result.0 = insertvalue { i64, i1 } undef, i64 %boxed, 0
  %result = insertvalue { i64, i1 } %result.0, i1 false, 1
  ret { i64, i1 } %result
convert:
  %converted = call { i64, i1 } @valueToStringObservable(i64 %value, i1 false)
  ret { i64, i1 } %converted
}

define i64 @symbolFromPropertyKey(ptr %key.ptr, i64 %key.len) {
entry:
  %is.sk = call i1 @isSymbolPropertyKey(ptr %key.ptr, i64 %key.len)
  br i1 %is.sk, label %check.dyn, label %not.sym
check.dyn:
  %gt3 = icmp ugt i64 %key.len, 4
  br i1 %gt3, label %check.hash, label %check.wk
check.hash:
  %p3 = getelementptr i8, ptr %key.ptr, i64 3
  %b3 = load i8, ptr %p3
  %is.hash = icmp eq i8 %b3, 35
  br i1 %is.hash, label %parse.id, label %check.wk
parse.id:
  %p4 = getelementptr i8, ptr %key.ptr, i64 4
  %id = call i64 @strtol(ptr %p4, ptr null, i32 10)
  %tagged = or i64 %id, 9222527611924643840
  ret i64 %tagged
check.wk:
  br label %wk.loop
wk.loop:
  %i = phi i64 [ 0, %check.wk ], [ %next, %wk.cont ]
  %done = icmp eq i64 %i, 14
  br i1 %done, label %not.sym, label %wk.cmp
wk.cmp:
  %kl.slot = getelementptr [14 x { ptr, i64 }], ptr @symbolWellKnownKeys, i64 0, i64 %i, i32 1
  %kl = load i64, ptr %kl.slot
  %same.len = icmp eq i64 %kl, %key.len
  br i1 %same.len, label %wk.bytes, label %wk.cont
wk.bytes:
  %kp.slot = getelementptr [14 x { ptr, i64 }], ptr @symbolWellKnownKeys, i64 0, i64 %i, i32 0
  %kp = load ptr, ptr %kp.slot
  %eq = call i32 @memcmp(ptr %kp, ptr %key.ptr, i64 %key.len)
  %hit = icmp eq i32 %eq, 0
  br i1 %hit, label %wk.hit, label %wk.cont
wk.hit:
  %wid = add i64 %i, 1
  %wtagged = or i64 %wid, 9222527611924643840
  ret i64 %wtagged
wk.cont:
  %next = add i64 %i, 1
  br label %wk.loop
not.sym:
  ret i64 0
}

define { i64, i1 } @symbolProtoToString(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %s = call { ptr, i64 } @symbolToString(i64 %this.val)
  %sp = extractvalue { ptr, i64 } %s, 0
  %sl = extractvalue { ptr, i64 } %s, 1
  %boxed = call i64 @valueCopyString(ptr %sp, i64 %sl)
  %r0 = insertvalue { i64, i1 } undef, i64 %boxed, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
}

define { i64, i1 } @symbolProtoValueOf(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %r0 = insertvalue { i64, i1 } undef, i64 %this.val, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
}

define i64 @symbolPropertyGet(i64 %sym.val, i64 %key.len, ptr %key.ptr) {
entry:
  %is.desc.l = icmp eq i64 %key.len, 11
  br i1 %is.desc.l, label %cmp.desc, label %check.ts
cmp.desc:
  %c0 = call i32 @memcmp(ptr %key.ptr, ptr @.sym.name.description, i64 11)
  %m0 = icmp eq i32 %c0, 0
  br i1 %m0, label %ret.desc, label %check.ts
ret.desc:
  %d = call i64 @symbolDescription(i64 %sym.val)
  ret i64 %d
check.ts:
  %is.ts.l = icmp eq i64 %key.len, 8
  br i1 %is.ts.l, label %cmp.ts, label %check.vo
cmp.ts:
  %c1 = call i32 @memcmp(ptr %key.ptr, ptr @.sym.name.toString, i64 8)
  %m1 = icmp eq i32 %c1, 0
  br i1 %m1, label %ret.ts, label %check.vo
ret.ts:
  %ts.fn = call i64 @functionObjectNew(ptr @symbolProtoToString, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 0)
  ret i64 %ts.fn
check.vo:
  %is.vo.l = icmp eq i64 %key.len, 7
  br i1 %is.vo.l, label %cmp.vo, label %missing
cmp.vo:
  %c2 = call i32 @memcmp(ptr %key.ptr, ptr @.sym.name.valueOf, i64 7)
  %m2 = icmp eq i32 %c2, 0
  br i1 %m2, label %ret.vo, label %missing
ret.vo:
  %vo.fn = call i64 @functionObjectNew(ptr @symbolProtoValueOf, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 0)
  ret i64 %vo.fn
missing:
  ret i64 9222246136947933184
}

define { i64, i1 } @symbolCtorInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %has.arg = icmp uge i64 %argc, 1
  br i1 %has.arg, label %read.arg, label %no.arg
read.arg:
  %a0 = load i64, ptr %argv
  br label %create
no.arg:
  br label %create
create:
  %arg = phi i64 [ %a0, %read.arg ], [ 9222246136947933184, %no.arg ]
  %sym = call i64 @symbolCreate(i64 %arg)
  %r0 = insertvalue { i64, i1 } undef, i64 %sym, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
}

define { i64, i1 } @symbolForInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %has.arg = icmp uge i64 %argc, 1
  br i1 %has.arg, label %read.arg, label %no.arg
read.arg:
  %a0 = load i64, ptr %argv
  br label %call.for
no.arg:
  br label %call.for
call.for:
  %arg = phi i64 [ %a0, %read.arg ], [ 9222246136947933184, %no.arg ]
  %sym = call i64 @symbolFor(i64 %arg)
  %r0 = insertvalue { i64, i1 } undef, i64 %sym, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
}

define { i64, i1 } @symbolKeyForInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %has.arg = icmp uge i64 %argc, 1
  br i1 %has.arg, label %read.arg, label %no.arg
read.arg:
  %a0 = load i64, ptr %argv
  br label %call.kf
no.arg:
  br label %call.kf
call.kf:
  %arg = phi i64 [ %a0, %read.arg ], [ 9222246136947933184, %no.arg ]
  %key = call i64 @symbolKeyFor(i64 %arg)
  %r0 = insertvalue { i64, i1 } undef, i64 %key, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
}

define i64 @symbolConstructorObject() {
entry:
  %cached = load i64, ptr @symbolCtorCache
  %ready = icmp ne i64 %cached, 0
  br i1 %ready, label %ret.cached, label %build
ret.cached:
  ret i64 %cached
build:
  %frame = call i64 @gcRootSave()
  %name.s = call i64 @valueCopyString(ptr @.sym.name.Symbol, i64 6)
  call void @gcRootPush(i64 %name.s)
  %ctor = call i64 @functionObjectNew(ptr @symbolCtorInvoke, ptr null, i64 9222246136947933184, i64 %name.s, i64 0)
  call void @gcRootPush(i64 %ctor)
  %props = call ptr @objectNew(i64 20)
  %props.v = call i64 @valueBoxObject(ptr %props)
  call void @gcRootPush(i64 %props.v)
  %for.fn = call i64 @functionObjectNew(ptr @symbolForInvoke, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 1)
  call void @objectSet(ptr %props, i64 3, ptr @.sym.name.for, i64 %for.fn)
  %kf.fn = call i64 @functionObjectNew(ptr @symbolKeyForInvoke, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 1)
  call void @objectSet(ptr %props, i64 6, ptr @.sym.name.keyFor, i64 %kf.fn)
  br label %wk.loop
wk.loop:
  %i = phi i64 [ 0, %build ], [ %next, %wk.loop ]
  %kp.slot = getelementptr [14 x { ptr, i64 }], ptr @symbolWellKnownKeys, i64 0, i64 %i, i32 0
  %kl.slot = getelementptr [14 x { ptr, i64 }], ptr @symbolWellKnownKeys, i64 0, i64 %i, i32 1
  %kp = load ptr, ptr %kp.slot
  %kl = load i64, ptr %kl.slot
  %prop.p = getelementptr i8, ptr %kp, i64 10
  %prop.l = sub i64 %kl, 10
  %wid = add i64 %i, 1
  %wsym = or i64 %wid, 9222527611924643840
  call void @objectSet(ptr %props, i64 %prop.l, ptr %prop.p, i64 %wsym)
  %next = add i64 %i, 1
  %done = icmp eq i64 %next, 14
  br i1 %done, label %finish, label %wk.loop
finish:
  call void @functionObjectAttachProperties(i64 %ctor, i64 %props.v)
  store i64 %ctor, ptr @symbolCtorCache
  call void @gcRegisterGlobalRoot(ptr @symbolCtorCache)
  call void @gcRootRestore(i64 %frame)
  ret i64 %ctor
}

; --- Object.getOwnPropertySymbols and Reflect.ownKeys ---

define ptr @objectOwnPropertySymbols(ptr %object) {
entry:
  %count = load i64, ptr %object
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  %array = call ptr @arrayNew(i64 0)
  %arr.v = call i64 @valueBoxArray(ptr %array)
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %arr.v)
  br label %loop
loop:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %count
  br i1 %done, label %exit, label %check
check:
  %off = mul i64 %i, 32
  %ep = getelementptr i8, ptr %entries, i64 %off
  %klen = load i64, ptr %ep
  %active = icmp sge i64 %klen, 0
  br i1 %active, label %check.sym, label %advance
check.sym:
  %kp.slot = getelementptr i8, ptr %ep, i64 8
  %kp = load ptr, ptr %kp.slot
  %sym = call i64 @symbolFromPropertyKey(ptr %kp, i64 %klen)
  %is.sym = icmp ne i64 %sym, 0
  br i1 %is.sym, label %push, label %advance
push:
  call i64 @arrayPush(ptr %array, i64 %sym)
  br label %advance
advance:
  %next = add i64 %i, 1
  br label %loop
exit:
  call void @gcRootRestore(i64 %frame)
  ret ptr %array
}

define ptr @objectBackingPtr(i64 %target) {
entry:
  %is.obj = call i1 @valueIsObject(i64 %target)
  br i1 %is.obj, label %obj, label %check.fn
obj:
  %is.col = call i1 @valueIsCollection(i64 %target)
  br i1 %is.col, label %none, label %plain.obj
plain.obj:
  %op = call ptr @valueObjectPtr(i64 %target)
  ret ptr %op
check.fn:
  %is.fn = call i1 @valueIsFunction(i64 %target)
  br i1 %is.fn, label %fn, label %none
fn:
  %fp = call ptr @functionObjectProperties(i64 %target)
  ret ptr %fp
none:
  ret ptr null
}

; --- General boxed Object static helpers ---

@.js.obj.name.value = private unnamed_addr constant [6 x i8] c"value\00"
@.js.obj.name.writable = private unnamed_addr constant [9 x i8] c"writable\00"
@.js.obj.name.enumerable = private unnamed_addr constant [11 x i8] c"enumerable\00"
@.js.obj.name.configurable = private unnamed_addr constant [13 x i8] c"configurable\00"
@.js.obj.name.get = private unnamed_addr constant [4 x i8] c"get\00"
@.js.obj.name.set = private unnamed_addr constant [4 x i8] c"set\00"

define { i64, i1 } @jsObjectCreate(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %frame = call i64 @gcRootSave()
  %has0 = icmp uge i64 %argc, 1
  br i1 %has0, label %read0, label %proto.null
read0:
  %p0 = load i64, ptr %argv
  %is.null = icmp eq i64 %p0, 9222246136947933187
  br i1 %is.null, label %proto.null, label %proto.obj
proto.null:
  %o.null = call ptr @objectCreate(ptr null)
  %v.null = call i64 @valueBoxObject(ptr %o.null)
  br label %check.props
proto.obj:
  %is.arr = call i1 @valueIsArray(i64 %p0)
  br i1 %is.arr, label %proto.from.default, label %proto.try.backing
proto.from.default:
  %o.def = call ptr @objectNew(i64 0)
  %v.def = call i64 @valueBoxObject(ptr %o.def)
  br label %check.props
proto.try.backing:
  %pptr = call ptr @objectBackingPtr(i64 %p0)
  %o.with = call ptr @objectCreate(ptr %pptr)
  %v.with = call i64 @valueBoxObject(ptr %o.with)
  br label %check.props
check.props:
  %res = phi i64 [ %v.null, %proto.null ], [ %v.def, %proto.from.default ], [ %v.with, %proto.try.backing ]
  call void @gcRootPush(i64 %res)
  %has1 = icmp uge i64 %argc, 2
  br i1 %has1, label %apply.props, label %done
apply.props:
  %p1.slot = getelementptr i64, ptr %argv, i64 1
  %p1 = load i64, ptr %p1.slot
  %p1.undef = icmp eq i64 %p1, 9222246136947933184
  br i1 %p1.undef, label %done, label %do.props
do.props:
  %dp.args = alloca [2 x i64]
  store i64 %res, ptr %dp.args
  %dp.a1 = getelementptr i64, ptr %dp.args, i64 1
  store i64 %p1, ptr %dp.a1
  %dp.res = call { i64, i1 } @jsObjectDefineProperties(i64 2, ptr %dp.args, ptr null, i64 9222246136947933184)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %dp.res
done:
  call void @gcRootRestore(i64 %frame)
  %r0 = insertvalue { i64, i1 } undef, i64 %res, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
}

define { i64, i1 } @jsObjectDefineProperty(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %ok.args = icmp uge i64 %argc, 3
  br i1 %ok.args, label %read.args, label %ret.undef
read.args:
  %frame = call i64 @gcRootSave()
  %target = load i64, ptr %argv
  %k.slot = getelementptr i64, ptr %argv, i64 1
  %key.val = load i64, ptr %k.slot
  %d.slot = getelementptr i64, ptr %argv, i64 2
  %desc.val = load i64, ptr %d.slot
  call void @gcRootPush(i64 %target)
  call void @gcRootPush(i64 %key.val)
  call void @gcRootPush(i64 %desc.val)
  %pk = call { ptr, i64 } @valueToPropertyKey(i64 %key.val)
  %kp = extractvalue { ptr, i64 } %pk, 0
  %kl = extractvalue { ptr, i64 } %pk, 1
  %has.get = call i1 @valueHasProperty(i64 %desc.val, i64 3, ptr @.js.obj.name.get)
  %has.set = call i1 @valueHasProperty(i64 %desc.val, i64 3, ptr @.js.obj.name.set)
  %is.acc = or i1 %has.get, %has.set
  %enum.v = call i64 @valuePropertyGet(i64 %desc.val, i64 10, ptr @.js.obj.name.enumerable)
  %enum.b = call i1 @valueTruthy(i64 %enum.v)
  %conf.v = call i64 @valuePropertyGet(i64 %desc.val, i64 12, ptr @.js.obj.name.configurable)
  %conf.b = call i1 @valueTruthy(i64 %conf.v)
  %enum.bit = select i1 %enum.b, i64 2, i64 0
  %conf.bit = select i1 %conf.b, i64 4, i64 0
  %base.flags = or i64 %enum.bit, %conf.bit
  %obj = call ptr @objectBackingPtr(i64 %target)
  %has.obj = icmp ne ptr %obj, null
  br i1 %has.obj, label %apply.obj, label %apply.fallback
apply.obj:
  br i1 %is.acc, label %def.acc, label %def.data
def.acc:
  %g.v = call i64 @valuePropertyGet(i64 %desc.val, i64 3, ptr @.js.obj.name.get)
  %s.v = call i64 @valuePropertyGet(i64 %desc.val, i64 3, ptr @.js.obj.name.set)
  %acc.flags = or i64 %base.flags, 8
  call void @objectDefineAccessorWithFlags(ptr %obj, i64 %kl, ptr %kp, i64 %g.v, i64 %s.v, i64 %acc.flags)
  br label %ret.target
def.data:
  %val.v = call i64 @valuePropertyGet(i64 %desc.val, i64 5, ptr @.js.obj.name.value)
  %w.v = call i64 @valuePropertyGet(i64 %desc.val, i64 8, ptr @.js.obj.name.writable)
  %w.b = call i1 @valueTruthy(i64 %w.v)
  %w.bit = select i1 %w.b, i64 1, i64 0
  %data.flags = or i64 %base.flags, %w.bit
  call void @objectDefineDataProperty(ptr %obj, i64 %kl, ptr %kp, i64 %val.v, i64 %data.flags)
  br label %ret.target
apply.fallback:
  %fb.val = call i64 @valuePropertyGet(i64 %desc.val, i64 5, ptr @.js.obj.name.value)
  %set.r = call { i64, i1 } @valueObjectSet(i64 %target, i64 %kl, ptr %kp, i64 %fb.val)
  br label %ret.target
ret.target:
  call void @gcRootRestore(i64 %frame)
  %r0 = insertvalue { i64, i1 } undef, i64 %target, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
ret.undef:
  ret { i64, i1 } { i64 9222246136947933184, i1 false }
}

define { i64, i1 } @jsObjectDefineProperties(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %ok.args = icmp uge i64 %argc, 2
  br i1 %ok.args, label %start, label %ret.undef
start:
  %frame = call i64 @gcRootSave()
  %target = load i64, ptr %argv
  %p.slot = getelementptr i64, ptr %argv, i64 1
  %props = load i64, ptr %p.slot
  call void @gcRootPush(i64 %target)
  call void @gcRootPush(i64 %props)
  %pobj = call ptr @objectBackingPtr(i64 %props)
  %has.pobj = icmp ne ptr %pobj, null
  br i1 %has.pobj, label %iter.props, label %done
iter.props:
  %count = load i64, ptr %pobj
  %entries.slot = getelementptr i8, ptr %pobj, i64 16
  %entries = load ptr, ptr %entries.slot
  %dp.args = alloca [3 x i64]
  br label %loop
loop:
  %i = phi i64 [ 0, %iter.props ], [ %next, %adv ]
  %loop.done = icmp eq i64 %i, %count
  br i1 %loop.done, label %done, label %check
check:
  %off = mul i64 %i, 32
  %ep = getelementptr i8, ptr %entries, i64 %off
  %klen = load i64, ptr %ep
  %active = icmp sge i64 %klen, 0
  br i1 %active, label %check.enum, label %adv
check.enum:
  %dflag.slot = getelementptr i8, ptr %ep, i64 24
  %dflag = load i64, ptr %dflag.slot
  %ebit = and i64 %dflag, 2
  %isenum = icmp ne i64 %ebit, 0
  br i1 %isenum, label %apply.one, label %adv
apply.one:
  %kp.slot = getelementptr i8, ptr %ep, i64 8
  %kp = load ptr, ptr %kp.slot
  %v.slot = getelementptr i8, ptr %ep, i64 16
  %dv = load i64, ptr %v.slot
  %sym = call i64 @symbolFromPropertyKey(ptr %kp, i64 %klen)
  %is.sym = icmp ne i64 %sym, 0
  br i1 %is.sym, label %use.sym, label %use.str
use.sym:
  br label %do.def
use.str:
  %kstr = call i64 @valueBoxString(ptr %kp, i64 %klen)
  br label %do.def
do.def:
  %kval = phi i64 [ %sym, %use.sym ], [ %kstr, %use.str ]
  store i64 %target, ptr %dp.args
  %a1 = getelementptr i64, ptr %dp.args, i64 1
  store i64 %kval, ptr %a1
  %a2 = getelementptr i64, ptr %dp.args, i64 2
  store i64 %dv, ptr %a2
  %r = call { i64, i1 } @jsObjectDefineProperty(i64 3, ptr %dp.args, ptr null, i64 9222246136947933184)
  br label %adv
adv:
  %next = add i64 %i, 1
  br label %loop
done:
  call void @gcRootRestore(i64 %frame)
  %r0 = insertvalue { i64, i1 } undef, i64 %target, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
ret.undef:
  ret { i64, i1 } { i64 9222246136947933184, i1 false }
}

define { i64, i1 } @jsObjectSetPrototypeOf(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %ok.args = icmp uge i64 %argc, 2
  br i1 %ok.args, label %start, label %ret.undef
start:
  %target = load i64, ptr %argv
  %p.slot = getelementptr i64, ptr %argv, i64 1
  %proto = load i64, ptr %p.slot
  %p.is.null = icmp eq i64 %proto, 9222246136947933187
  br i1 %p.is.null, label %proto.null, label %proto.obj
proto.null:
  br label %apply
proto.obj:
  %pptr = call ptr @objectBackingPtr(i64 %proto)
  br label %apply
apply:
  %proto.ptr = phi ptr [ null, %proto.null ], [ %pptr, %proto.obj ]
  %is.arr = call i1 @valueIsArray(i64 %target)
  br i1 %is.arr, label %set.arr, label %set.obj
set.arr:
  %ap = call ptr @valueArrayPtr(i64 %target)
  call void @arraySetPrototype(ptr %ap, ptr %proto.ptr)
  br label %done
set.obj:
  %op = call ptr @objectBackingPtr(i64 %target)
  %has.op = icmp ne ptr %op, null
  br i1 %has.op, label %do.set.obj, label %done
do.set.obj:
  call void @objectSetPrototype(ptr %op, ptr %proto.ptr)
  br label %done
done:
  %r0 = insertvalue { i64, i1 } undef, i64 %target, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
ret.undef:
  ret { i64, i1 } { i64 9222246136947933184, i1 false }
}

define { i64, i1 } @jsObjectGetPrototypeOf(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %ok.args = icmp uge i64 %argc, 1
  br i1 %ok.args, label %start, label %ret.null
start:
  %target = load i64, ptr %argv
  %is.arr = call i1 @valueIsArray(i64 %target)
  br i1 %is.arr, label %from.arr, label %from.obj
from.arr:
  %ap = call ptr @valueArrayPtr(i64 %target)
  %ap.proto = call ptr @arrayGetPrototype(ptr %ap)
  %ap.null = icmp eq ptr %ap.proto, null
  br i1 %ap.null, label %ret.arr.proto, label %box.proto
ret.arr.proto:
  %def.ap = call i64 @jsArrayPrototypeObject()
  %ar0 = insertvalue { i64, i1 } undef, i64 %def.ap, 0
  %ar1 = insertvalue { i64, i1 } %ar0, i1 false, 1
  ret { i64, i1 } %ar1
from.obj:
  %op = call ptr @objectBackingPtr(i64 %target)
  %has.op = icmp ne ptr %op, null
  br i1 %has.op, label %get.op, label %ret.null
get.op:
  %op.proto = call ptr @objectGetPrototype(ptr %op)
  %op.null = icmp eq ptr %op.proto, null
  br i1 %op.null, label %ret.null, label %box.proto
box.proto:
  %pp = phi ptr [ %ap.proto, %from.arr ], [ %op.proto, %get.op ]
  %pv = call i64 @valueBoxObject(ptr %pp)
  %r0 = insertvalue { i64, i1 } undef, i64 %pv, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
ret.null:
  ret { i64, i1 } { i64 9222246136947933187, i1 false }
}

define { i64, i1 } @jsObjectGetOwnPropertyDescriptor(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %ok.args = icmp uge i64 %argc, 2
  br i1 %ok.args, label %start, label %ret.undef
start:
  %target = load i64, ptr %argv
  %k.slot = getelementptr i64, ptr %argv, i64 1
  %key.val = load i64, ptr %k.slot
  %pk = call { ptr, i64 } @valueToPropertyKey(i64 %key.val)
  %kp = extractvalue { ptr, i64 } %pk, 0
  %kl = extractvalue { ptr, i64 } %pk, 1
  %is.fn = call i1 @valueIsFunction(i64 %target)
  br i1 %is.fn, label %fn.desc, label %obj.desc
fn.desc:
  %fd = call i64 @functionObjectOwnPropertyDescriptor(i64 %target, i64 %kl, ptr %kp)
  %fr0 = insertvalue { i64, i1 } undef, i64 %fd, 0
  %fr1 = insertvalue { i64, i1 } %fr0, i1 false, 1
  ret { i64, i1 } %fr1
obj.desc:
  %op = call ptr @objectBackingPtr(i64 %target)
  %has.op = icmp ne ptr %op, null
  br i1 %has.op, label %do.obj, label %ret.undef
do.obj:
  %od = call i64 @objectOwnPropertyDescriptor(ptr %op, i64 %kl, ptr %kp)
  %or0 = insertvalue { i64, i1 } undef, i64 %od, 0
  %or1 = insertvalue { i64, i1 } %or0, i1 false, 1
  ret { i64, i1 } %or1
ret.undef:
  ret { i64, i1 } { i64 9222246136947933184, i1 false }
}

define { i64, i1 } @jsObjectGetOwnPropertySymbols(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %ok.args = icmp uge i64 %argc, 1
  br i1 %ok.args, label %start, label %ret.empty
start:
  %target = load i64, ptr %argv
  %op = call ptr @objectBackingPtr(i64 %target)
  %has.op = icmp ne ptr %op, null
  br i1 %has.op, label %do.obj, label %ret.empty
do.obj:
  %arr = call ptr @objectOwnPropertySymbols(ptr %op)
  %av = call i64 @valueBoxArray(ptr %arr)
  %r0 = insertvalue { i64, i1 } undef, i64 %av, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
ret.empty:
  %e = call ptr @arrayNew(i64 0)
  %ev = call i64 @valueBoxArray(ptr %e)
  %e0 = insertvalue { i64, i1 } undef, i64 %ev, 0
  %e1 = insertvalue { i64, i1 } %e0, i1 false, 1
  ret { i64, i1 } %e1
}

define { i64, i1 } @jsObjectKeysInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %ok = icmp uge i64 %argc, 1
  br i1 %ok, label %go, label %empty
go:
  %t = load i64, ptr %argv
  %arr = call ptr @valueObjectKeys(i64 %t)
  %av = call i64 @valueBoxArray(ptr %arr)
  %r0 = insertvalue { i64, i1 } undef, i64 %av, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
empty:
  %e = call ptr @arrayNew(i64 0)
  %ev = call i64 @valueBoxArray(ptr %e)
  %e0 = insertvalue { i64, i1 } undef, i64 %ev, 0
  %e1 = insertvalue { i64, i1 } %e0, i1 false, 1
  ret { i64, i1 } %e1
}

define { i64, i1 } @jsObjectValuesInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %ok = icmp uge i64 %argc, 1
  br i1 %ok, label %go, label %empty
go:
  %t = load i64, ptr %argv
  %arr = call ptr @valueObjectValues(i64 %t)
  %av = call i64 @valueBoxArray(ptr %arr)
  %r0 = insertvalue { i64, i1 } undef, i64 %av, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
empty:
  %e = call ptr @arrayNew(i64 0)
  %ev = call i64 @valueBoxArray(ptr %e)
  %e0 = insertvalue { i64, i1 } undef, i64 %ev, 0
  %e1 = insertvalue { i64, i1 } %e0, i1 false, 1
  ret { i64, i1 } %e1
}

define { i64, i1 } @jsObjectEntriesInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %ok = icmp uge i64 %argc, 1
  br i1 %ok, label %go, label %empty
go:
  %t = load i64, ptr %argv
  %arr = call ptr @valueObjectEntries(i64 %t)
  %av = call i64 @valueBoxArray(ptr %arr)
  %r0 = insertvalue { i64, i1 } undef, i64 %av, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
empty:
  %e = call ptr @arrayNew(i64 0)
  %ev = call i64 @valueBoxArray(ptr %e)
  %e0 = insertvalue { i64, i1 } undef, i64 %ev, 0
  %e1 = insertvalue { i64, i1 } %e0, i1 false, 1
  ret { i64, i1 } %e1
}

define { i64, i1 } @jsObjectOwnPropertyNamesInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %ok = icmp uge i64 %argc, 1
  br i1 %ok, label %go, label %empty
go:
  %t = load i64, ptr %argv
  %arr = call ptr @valueObjectOwnPropertyNames(i64 %t)
  %av = call i64 @valueBoxArray(ptr %arr)
  %r0 = insertvalue { i64, i1 } undef, i64 %av, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
empty:
  %e = call ptr @arrayNew(i64 0)
  %ev = call i64 @valueBoxArray(ptr %e)
  %e0 = insertvalue { i64, i1 } undef, i64 %ev, 0
  %e1 = insertvalue { i64, i1 } %e0, i1 false, 1
  ret { i64, i1 } %e1
}

define { i64, i1 } @jsObjectOwnPropertyDescriptorsInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %ok = icmp uge i64 %argc, 1
  br i1 %ok, label %go, label %empty
go:
  %t = load i64, ptr %argv
  %op = call ptr @objectBackingPtr(i64 %t)
  %has = icmp ne ptr %op, null
  br i1 %has, label %do.op, label %empty
do.op:
  %res = call ptr @objectOwnPropertyDescriptors(ptr %op)
  %rv = call i64 @valueBoxObject(ptr %res)
  %r0 = insertvalue { i64, i1 } undef, i64 %rv, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
empty:
  %e = call ptr @objectNew(i64 0)
  %ev = call i64 @valueBoxObject(ptr %e)
  %e0 = insertvalue { i64, i1 } undef, i64 %ev, 0
  %e1 = insertvalue { i64, i1 } %e0, i1 false, 1
  ret { i64, i1 } %e1
}

define { i64, i1 } @jsObjectAssignInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %ok = icmp uge i64 %argc, 1
  br i1 %ok, label %start, label %ret.undef
start:
  %frame = call i64 @gcRootSave()
  %target = load i64, ptr %argv
  call void @gcRootPush(i64 %target)
  %tobj = call ptr @objectBackingPtr(i64 %target)
  %has.tobj = icmp ne ptr %tobj, null
  br i1 %has.tobj, label %loop, label %done
loop:
  %i = phi i64 [ 1, %start ], [ %next, %adv ]
  %end = icmp uge i64 %i, %argc
  br i1 %end, label %done, label %body
body:
  %s.slot = getelementptr i64, ptr %argv, i64 %i
  %src = load i64, ptr %s.slot
  %s.arr = call i1 @valueIsArray(i64 %src)
  br i1 %s.arr, label %from.arr, label %from.obj
from.arr:
  %sa = call ptr @valueArrayPtr(i64 %src)
  call void @objectAssignArray(ptr %tobj, ptr %sa)
  br label %adv
from.obj:
  %so = call ptr @objectBackingPtr(i64 %src)
  %has.so = icmp ne ptr %so, null
  br i1 %has.so, label %do.assign, label %adv
do.assign:
  call void @objectAssign(ptr %tobj, ptr %so)
  br label %adv
adv:
  %next = add i64 %i, 1
  br label %loop
done:
  call void @gcRootRestore(i64 %frame)
  %r0 = insertvalue { i64, i1 } undef, i64 %target, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
ret.undef:
  ret { i64, i1 } { i64 9222246136947933184, i1 false }
}

define { i64, i1 } @jsObjectHasOwnInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %ok = icmp uge i64 %argc, 2
  br i1 %ok, label %go, label %ret.false
go:
  %t = load i64, ptr %argv
  %k.slot = getelementptr i64, ptr %argv, i64 1
  %kv = load i64, ptr %k.slot
  %pk = call { ptr, i64 } @valueToPropertyKey(i64 %kv)
  %kp = extractvalue { ptr, i64 } %pk, 0
  %kl = extractvalue { ptr, i64 } %pk, 1
  %op = call ptr @objectBackingPtr(i64 %t)
  %has.op = icmp ne ptr %op, null
  br i1 %has.op, label %check.obj, label %ret.false
check.obj:
  %h = call i1 @objectHasOwn(ptr %op, i64 %kl, ptr %kp)
  %bv = select i1 %h, i64 9222246136947933186, i64 9222246136947933185
  %r0 = insertvalue { i64, i1 } undef, i64 %bv, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
ret.false:
  ret { i64, i1 } { i64 9222246136947933185, i1 false }
}

define { i64, i1 } @jsObjectIsInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %has0 = icmp uge i64 %argc, 1
  br i1 %has0, label %r0.b, label %u0.b
r0.b:
  %v0 = load i64, ptr %argv
  br label %c1
u0.b:
  br label %c1
c1:
  %a = phi i64 [ %v0, %r0.b ], [ 9222246136947933184, %u0.b ]
  %has1 = icmp uge i64 %argc, 2
  br i1 %has1, label %r1.b, label %u1.b
r1.b:
  %s1 = getelementptr i64, ptr %argv, i64 1
  %v1 = load i64, ptr %s1
  br label %cmp
u1.b:
  br label %cmp
cmp:
  %b = phi i64 [ %v1, %r1.b ], [ 9222246136947933184, %u1.b ]
  %eq = call i1 @objectIs(i64 %a, i64 %b)
  %bv = select i1 %eq, i64 9222246136947933186, i64 9222246136947933185
  %res0 = insertvalue { i64, i1 } undef, i64 %bv, 0
  %res1 = insertvalue { i64, i1 } %res0, i1 false, 1
  ret { i64, i1 } %res1
}

define { i64, i1 } @jsObjectFromEntriesInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %ok = icmp uge i64 %argc, 1
  br i1 %ok, label %go, label %empty
go:
  %arg = load i64, ptr %argv
  %is.arr = call i1 @valueIsArray(i64 %arg)
  br i1 %is.arr, label %arr, label %empty
arr:
  %ap = call ptr @valueArrayPtr(i64 %arg)
  %o = call ptr @objectFromEntries(ptr %ap)
  %ov = call i64 @valueBoxObject(ptr %o)
  %r0 = insertvalue { i64, i1 } undef, i64 %ov, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
empty:
  %eo = call ptr @objectNew(i64 0)
  %eov = call i64 @valueBoxObject(ptr %eo)
  %e0 = insertvalue { i64, i1 } undef, i64 %eov, 0
  %e1 = insertvalue { i64, i1 } %e0, i1 false, 1
  ret { i64, i1 } %e1
}

define { i64, i1 } @jsObjectFreezeInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %ok = icmp uge i64 %argc, 1
  br i1 %ok, label %go, label %undef
go:
  %t = load i64, ptr %argv
  %op = call ptr @objectBackingPtr(i64 %t)
  %has = icmp ne ptr %op, null
  br i1 %has, label %do.op, label %done
do.op:
  call void @objectFreeze(ptr %op)
  br label %done
done:
  %r0 = insertvalue { i64, i1 } undef, i64 %t, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
undef:
  ret { i64, i1 } { i64 9222246136947933184, i1 false }
}

define { i64, i1 } @jsObjectSealInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %ok = icmp uge i64 %argc, 1
  br i1 %ok, label %go, label %undef
go:
  %t = load i64, ptr %argv
  %op = call ptr @objectBackingPtr(i64 %t)
  %has = icmp ne ptr %op, null
  br i1 %has, label %do.op, label %done
do.op:
  call void @objectSeal(ptr %op)
  br label %done
done:
  %r0 = insertvalue { i64, i1 } undef, i64 %t, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
undef:
  ret { i64, i1 } { i64 9222246136947933184, i1 false }
}

define { i64, i1 } @jsObjectPreventExtensionsInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %ok = icmp uge i64 %argc, 1
  br i1 %ok, label %go, label %undef
go:
  %t = load i64, ptr %argv
  %op = call ptr @objectBackingPtr(i64 %t)
  %has = icmp ne ptr %op, null
  br i1 %has, label %do.op, label %done
do.op:
  call void @objectPreventExtensions(ptr %op)
  br label %done
done:
  %r0 = insertvalue { i64, i1 } undef, i64 %t, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
undef:
  ret { i64, i1 } { i64 9222246136947933184, i1 false }
}

define { i64, i1 } @jsObjectCtorInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %has0 = icmp uge i64 %argc, 1
  br i1 %has0, label %check0, label %new.obj
check0:
  %v0 = load i64, ptr %argv
  %is.u = icmp eq i64 %v0, 9222246136947933184
  %is.n = icmp eq i64 %v0, 9222246136947933187
  %is.nullish = or i1 %is.u, %is.n
  br i1 %is.nullish, label %new.obj, label %ret.v0
ret.v0:
  %r0 = insertvalue { i64, i1 } undef, i64 %v0, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
new.obj:
  %o = call ptr @objectNew(i64 0)
  %ov = call i64 @valueBoxObject(ptr %o)
  %n0 = insertvalue { i64, i1 } undef, i64 %ov, 0
  %n1 = insertvalue { i64, i1 } %n0, i1 false, 1
  ret { i64, i1 } %n1
}

@.obj.n.Object = private unnamed_addr constant [7 x i8] c"Object\00"
@.obj.n.create = private unnamed_addr constant [7 x i8] c"create\00"
@.obj.n.defineProperty = private unnamed_addr constant [15 x i8] c"defineProperty\00"
@.obj.n.defineProperties = private unnamed_addr constant [17 x i8] c"defineProperties\00"
@.obj.n.setPrototypeOf = private unnamed_addr constant [15 x i8] c"setPrototypeOf\00"
@.obj.n.getPrototypeOf = private unnamed_addr constant [15 x i8] c"getPrototypeOf\00"
@.obj.n.getOwnPropertyDescriptor = private unnamed_addr constant [25 x i8] c"getOwnPropertyDescriptor\00"
@.obj.n.getOwnPropertyDescriptors = private unnamed_addr constant [26 x i8] c"getOwnPropertyDescriptors\00"
@.obj.n.getOwnPropertyNames = private unnamed_addr constant [20 x i8] c"getOwnPropertyNames\00"
@.obj.n.getOwnPropertySymbols = private unnamed_addr constant [22 x i8] c"getOwnPropertySymbols\00"
@.obj.n.keys = private unnamed_addr constant [5 x i8] c"keys\00"
@.obj.n.values = private unnamed_addr constant [7 x i8] c"values\00"
@.obj.n.entries = private unnamed_addr constant [8 x i8] c"entries\00"
@.obj.n.fromEntries = private unnamed_addr constant [12 x i8] c"fromEntries\00"
@.obj.n.assign = private unnamed_addr constant [7 x i8] c"assign\00"
@.obj.n.hasOwn = private unnamed_addr constant [7 x i8] c"hasOwn\00"
@.obj.n.is = private unnamed_addr constant [3 x i8] c"is\00"
@.obj.n.freeze = private unnamed_addr constant [7 x i8] c"freeze\00"
@.obj.n.seal = private unnamed_addr constant [5 x i8] c"seal\00"
@.obj.n.preventExtensions = private unnamed_addr constant [18 x i8] c"preventExtensions\00"
@.obj.n.prototype = private unnamed_addr constant [10 x i8] c"prototype\00"

define void @jsAttachMethod(ptr %props, i64 %len, ptr %name, ptr %code, i64 %arity) {
entry:
  %fn = call i64 @functionObjectNew(ptr %code, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 %arity)
  call void @objectSet(ptr %props, i64 %len, ptr %name, i64 %fn)
  ret void
}

define i64 @jsObjectConstructor() {
entry:
  %cached = load i64, ptr @jsObjectCtorCache
  %ready = icmp ne i64 %cached, 0
  br i1 %ready, label %ret.cached, label %build
ret.cached:
  ret i64 %cached
build:
  %frame = call i64 @gcRootSave()
  %name.s = call i64 @valueCopyString(ptr @.obj.n.Object, i64 6)
  call void @gcRootPush(i64 %name.s)
  %ctor = call i64 @functionObjectNew(ptr @jsObjectCtorInvoke, ptr null, i64 9222246136947933184, i64 %name.s, i64 1)
  call void @gcRootPush(i64 %ctor)
  %props = call ptr @objectNew(i64 24)
  %props.v = call i64 @valueBoxObject(ptr %props)
  call void @gcRootPush(i64 %props.v)
  call void @jsAttachMethod(ptr %props, i64 6,  ptr @.obj.n.create, ptr @jsObjectCreate, i64 2)
  call void @jsAttachMethod(ptr %props, i64 14, ptr @.obj.n.defineProperty, ptr @jsObjectDefineProperty, i64 3)
  call void @jsAttachMethod(ptr %props, i64 16, ptr @.obj.n.defineProperties, ptr @jsObjectDefineProperties, i64 2)
  call void @jsAttachMethod(ptr %props, i64 14, ptr @.obj.n.setPrototypeOf, ptr @jsObjectSetPrototypeOf, i64 2)
  call void @jsAttachMethod(ptr %props, i64 14, ptr @.obj.n.getPrototypeOf, ptr @jsObjectGetPrototypeOf, i64 1)
  call void @jsAttachMethod(ptr %props, i64 24, ptr @.obj.n.getOwnPropertyDescriptor, ptr @jsObjectGetOwnPropertyDescriptor, i64 2)
  call void @jsAttachMethod(ptr %props, i64 25, ptr @.obj.n.getOwnPropertyDescriptors, ptr @jsObjectOwnPropertyDescriptorsInvoke, i64 1)
  call void @jsAttachMethod(ptr %props, i64 19, ptr @.obj.n.getOwnPropertyNames, ptr @jsObjectOwnPropertyNamesInvoke, i64 1)
  call void @jsAttachMethod(ptr %props, i64 21, ptr @.obj.n.getOwnPropertySymbols, ptr @jsObjectGetOwnPropertySymbols, i64 1)
  call void @jsAttachMethod(ptr %props, i64 4,  ptr @.obj.n.keys, ptr @jsObjectKeysInvoke, i64 1)
  call void @jsAttachMethod(ptr %props, i64 6,  ptr @.obj.n.values, ptr @jsObjectValuesInvoke, i64 1)
  call void @jsAttachMethod(ptr %props, i64 7,  ptr @.obj.n.entries, ptr @jsObjectEntriesInvoke, i64 1)
  call void @jsAttachMethod(ptr %props, i64 11, ptr @.obj.n.fromEntries, ptr @jsObjectFromEntriesInvoke, i64 1)
  call void @jsAttachMethod(ptr %props, i64 6,  ptr @.obj.n.assign, ptr @jsObjectAssignInvoke, i64 2)
  call void @jsAttachMethod(ptr %props, i64 6,  ptr @.obj.n.hasOwn, ptr @jsObjectHasOwnInvoke, i64 2)
  call void @jsAttachMethod(ptr %props, i64 2,  ptr @.obj.n.is, ptr @jsObjectIsInvoke, i64 2)
  call void @jsAttachMethod(ptr %props, i64 6,  ptr @.obj.n.freeze, ptr @jsObjectFreezeInvoke, i64 1)
  call void @jsAttachMethod(ptr %props, i64 4,  ptr @.obj.n.seal, ptr @jsObjectSealInvoke, i64 1)
  call void @jsAttachMethod(ptr %props, i64 17, ptr @.obj.n.preventExtensions, ptr @jsObjectPreventExtensionsInvoke, i64 1)
  %def.proto = call ptr @objectDefaultPrototype()
  %def.proto.v = call i64 @valueBoxObject(ptr %def.proto)
  call void @objectSet(ptr %props, i64 9, ptr @.obj.n.prototype, i64 %def.proto.v)
  call void @functionObjectAttachProperties(i64 %ctor, i64 %props.v)
  store i64 %ctor, ptr @jsObjectCtorCache
  call void @gcRegisterGlobalRoot(ptr @jsObjectCtorCache)
  call void @gcRootRestore(i64 %frame)
  ret i64 %ctor
}

; --- Reflect global object ---

@.refl.n.ownKeys = private unnamed_addr constant [8 x i8] c"ownKeys\00"
@.refl.n.get = private unnamed_addr constant [4 x i8] c"get\00"
@.refl.n.set = private unnamed_addr constant [4 x i8] c"set\00"
@.refl.n.has = private unnamed_addr constant [4 x i8] c"has\00"
@.refl.n.deleteProperty = private unnamed_addr constant [15 x i8] c"deleteProperty\00"
@.refl.n.apply = private unnamed_addr constant [6 x i8] c"apply\00"
@.refl.n.construct = private unnamed_addr constant [10 x i8] c"construct\00"

define { i64, i1 } @jsReflectOwnKeys(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %frame = call i64 @gcRootSave()
  %out = call ptr @arrayNew(i64 0)
  %out.v = call i64 @valueBoxArray(ptr %out)
  call void @gcRootPush(i64 %out.v)
  %ok = icmp uge i64 %argc, 1
  br i1 %ok, label %go, label %done
go:
  %t = load i64, ptr %argv
  call void @gcRootPush(i64 %t)
  %names = call ptr @valueObjectOwnPropertyNames(i64 %t)
  %names.v = call i64 @valueBoxArray(ptr %names)
  call void @gcRootPush(i64 %names.v)
  %nlen = call i64 @arrayLength(ptr %names)
  br label %copy.names
copy.names:
  %ni = phi i64 [ 0, %go ], [ %nnext, %copy.names.body ]
  %ndone = icmp eq i64 %ni, %nlen
  br i1 %ndone, label %do.syms, label %copy.names.body
copy.names.body:
  %nv = call i64 @arrayGet(ptr %names, i64 %ni)
  call i64 @arrayPush(ptr %out, i64 %nv)
  %nnext = add i64 %ni, 1
  br label %copy.names
do.syms:
  %op = call ptr @objectBackingPtr(i64 %t)
  %has.op = icmp ne ptr %op, null
  br i1 %has.op, label %copy.syms.start, label %done
copy.syms.start:
  %syms = call ptr @objectOwnPropertySymbols(ptr %op)
  %syms.v = call i64 @valueBoxArray(ptr %syms)
  call void @gcRootPush(i64 %syms.v)
  %slen = call i64 @arrayLength(ptr %syms)
  br label %copy.syms
copy.syms:
  %si = phi i64 [ 0, %copy.syms.start ], [ %snext, %copy.syms.body ]
  %sdone = icmp eq i64 %si, %slen
  br i1 %sdone, label %done, label %copy.syms.body
copy.syms.body:
  %sv = call i64 @arrayGet(ptr %syms, i64 %si)
  call i64 @arrayPush(ptr %out, i64 %sv)
  %snext = add i64 %si, 1
  br label %copy.syms
done:
  call void @gcRootRestore(i64 %frame)
  %r0 = insertvalue { i64, i1 } undef, i64 %out.v, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
}

define { i64, i1 } @jsReflectGet(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %ok = icmp uge i64 %argc, 2
  br i1 %ok, label %go, label %undef
go:
  %t = load i64, ptr %argv
  %ks = getelementptr i64, ptr %argv, i64 1
  %kv = load i64, ptr %ks
  %pk = call { ptr, i64 } @valueToPropertyKey(i64 %kv)
  %kp = extractvalue { ptr, i64 } %pk, 0
  %kl = extractvalue { ptr, i64 } %pk, 1
  %res = call { i64, i1 } @checkedValuePropertyGet(i64 %t, i64 %kl, ptr %kp)
  ret { i64, i1 } %res
undef:
  ret { i64, i1 } { i64 9222246136947933184, i1 false }
}

define { i64, i1 } @jsReflectSet(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %ok = icmp uge i64 %argc, 3
  br i1 %ok, label %go, label %ret.false
go:
  %t = load i64, ptr %argv
  %ks = getelementptr i64, ptr %argv, i64 1
  %kv = load i64, ptr %ks
  %vs = getelementptr i64, ptr %argv, i64 2
  %vv = load i64, ptr %vs
  %pk = call { ptr, i64 } @valueToPropertyKey(i64 %kv)
  %kp = extractvalue { ptr, i64 } %pk, 0
  %kl = extractvalue { ptr, i64 } %pk, 1
  %res = call { i64, i1 } @valueObjectSet(i64 %t, i64 %kl, ptr %kp, i64 %vv)
  %threw = extractvalue { i64, i1 } %res, 1
  br i1 %threw, label %err, label %ret.true
err:
  ret { i64, i1 } %res
ret.true:
  ret { i64, i1 } { i64 9222246136947933186, i1 false }
ret.false:
  ret { i64, i1 } { i64 9222246136947933185, i1 false }
}

define { i64, i1 } @jsReflectHas(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %ok = icmp uge i64 %argc, 2
  br i1 %ok, label %go, label %ret.false
go:
  %t = load i64, ptr %argv
  %ks = getelementptr i64, ptr %argv, i64 1
  %kv = load i64, ptr %ks
  %pk = call { ptr, i64 } @valueToPropertyKey(i64 %kv)
  %kp = extractvalue { ptr, i64 } %pk, 0
  %kl = extractvalue { ptr, i64 } %pk, 1
  %h = call i1 @valueHasProperty(i64 %t, i64 %kl, ptr %kp)
  %bv = select i1 %h, i64 9222246136947933186, i64 9222246136947933185
  %r0 = insertvalue { i64, i1 } undef, i64 %bv, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
ret.false:
  ret { i64, i1 } { i64 9222246136947933185, i1 false }
}

define { i64, i1 } @jsReflectDeleteProperty(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %ok = icmp uge i64 %argc, 2
  br i1 %ok, label %go, label %ret.false
go:
  %t = load i64, ptr %argv
  %ks = getelementptr i64, ptr %argv, i64 1
  %kv = load i64, ptr %ks
  %pk = call { ptr, i64 } @valueToPropertyKey(i64 %kv)
  %kp = extractvalue { ptr, i64 } %pk, 0
  %kl = extractvalue { ptr, i64 } %pk, 1
  %op = call ptr @objectBackingPtr(i64 %t)
  %has = icmp ne ptr %op, null
  br i1 %has, label %do.del, label %ret.true
do.del:
  call void @objectDelete(ptr %op, i64 %kl, ptr %kp)
  br label %ret.true
ret.true:
  ret { i64, i1 } { i64 9222246136947933186, i1 false }
ret.false:
  ret { i64, i1 } { i64 9222246136947933185, i1 false }
}

define { i64, i1 } @jsReflectApply(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %ok = icmp uge i64 %argc, 3
  br i1 %ok, label %go, label %undef
go:
  %target = load i64, ptr %argv
  %s1 = getelementptr i64, ptr %argv, i64 1
  %thisArg = load i64, ptr %s1
  %s2 = getelementptr i64, ptr %argv, i64 2
  %argsList = load i64, ptr %s2
  %apply.args = alloca [2 x i64]
  store i64 %thisArg, ptr %apply.args
  %a1 = getelementptr i64, ptr %apply.args, i64 1
  store i64 %argsList, ptr %a1
  %res = call { i64, i1 } @functionProtoApply(i64 2, ptr %apply.args, ptr null, i64 %target)
  ret { i64, i1 } %res
undef:
  ret { i64, i1 } { i64 9222246136947933184, i1 false }
}

define i64 @jsReflectObject() {
entry:
  %cached = load i64, ptr @jsReflectObjCache
  %ready = icmp ne i64 %cached, 0
  br i1 %ready, label %ret.cached, label %build
ret.cached:
  ret i64 %cached
build:
  %frame = call i64 @gcRootSave()
  %obj = call ptr @objectNew(i64 12)
  %ov = call i64 @valueBoxObject(ptr %obj)
  call void @gcRootPush(i64 %ov)
  call void @jsAttachMethod(ptr %obj, i64 7,  ptr @.refl.n.ownKeys, ptr @jsReflectOwnKeys, i64 1)
  call void @jsAttachMethod(ptr %obj, i64 3,  ptr @.refl.n.get, ptr @jsReflectGet, i64 2)
  call void @jsAttachMethod(ptr %obj, i64 3,  ptr @.refl.n.set, ptr @jsReflectSet, i64 3)
  call void @jsAttachMethod(ptr %obj, i64 3,  ptr @.refl.n.has, ptr @jsReflectHas, i64 2)
  call void @jsAttachMethod(ptr %obj, i64 14, ptr @.refl.n.deleteProperty, ptr @jsReflectDeleteProperty, i64 2)
  call void @jsAttachMethod(ptr %obj, i64 5,  ptr @.refl.n.apply, ptr @jsReflectApply, i64 3)
  call void @jsAttachMethod(ptr %obj, i64 14, ptr @.obj.n.defineProperty, ptr @jsObjectDefineProperty, i64 3)
  call void @jsAttachMethod(ptr %obj, i64 24, ptr @.obj.n.getOwnPropertyDescriptor, ptr @jsObjectGetOwnPropertyDescriptor, i64 2)
  call void @jsAttachMethod(ptr %obj, i64 14, ptr @.obj.n.getPrototypeOf, ptr @jsObjectGetPrototypeOf, i64 1)
  call void @jsAttachMethod(ptr %obj, i64 14, ptr @.obj.n.setPrototypeOf, ptr @jsObjectSetPrototypeOf, i64 2)
  store i64 %ov, ptr @jsReflectObjCache
  call void @gcRegisterGlobalRoot(ptr @jsReflectObjCache)
  call void @gcRootRestore(i64 %frame)
  ret i64 %ov
}

; --- Array constructor & Array.prototype ---

@.arr.n.Array = private unnamed_addr constant [6 x i8] c"Array\00"
@.arr.n.isArray = private unnamed_addr constant [8 x i8] c"isArray\00"
@.arr.n.from = private unnamed_addr constant [5 x i8] c"from\00"
@.arr.n.of = private unnamed_addr constant [3 x i8] c"of\00"

define { i64, i1 } @jsArrayCtorInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %frame = call i64 @gcRootSave()
  %is.one = icmp eq i64 %argc, 1
  br i1 %is.one, label %check.len, label %from.items
check.len:
  %a0 = load i64, ptr %argv
  %is.num = call i1 @valueIsNumberForSameValueZero(i64 %a0)
  br i1 %is.num, label %alloc.len, label %from.items
alloc.len:
  %d = call double @valueNumber(i64 %a0)
  %n = fptosi double %d to i64
  %nonneg = icmp sge i64 %n, 0
  %cnt = select i1 %nonneg, i64 %n, i64 0
  %arr = call ptr @arrayNew(i64 %cnt)
  %av = call i64 @valueBoxArray(ptr %arr)
  call void @gcRootRestore(i64 %frame)
  %r0 = insertvalue { i64, i1 } undef, i64 %av, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
from.items:
  %arr2 = call ptr @arrayNew(i64 %argc)
  %av2 = call i64 @valueBoxArray(ptr %arr2)
  call void @gcRootPush(i64 %av2)
  br label %fill
fill:
  %i = phi i64 [ 0, %from.items ], [ %next, %fill.body ]
  %done = icmp eq i64 %i, %argc
  br i1 %done, label %fill.done, label %fill.body
fill.body:
  %slot = getelementptr i64, ptr %argv, i64 %i
  %v = load i64, ptr %slot
  call void @arraySet(ptr %arr2, i64 %i, i64 %v)
  %next = add i64 %i, 1
  br label %fill
fill.done:
  call void @gcRootRestore(i64 %frame)
  %f0 = insertvalue { i64, i1 } undef, i64 %av2, 0
  %f1 = insertvalue { i64, i1 } %f0, i1 false, 1
  ret { i64, i1 } %f1
}

define { i64, i1 } @jsArrayIsArrayInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %ok = icmp uge i64 %argc, 1
  br i1 %ok, label %check, label %ret.false
check:
  %a0 = load i64, ptr %argv
  %is.a = call i1 @valueIsArray(i64 %a0)
  %bv = select i1 %is.a, i64 9222246136947933186, i64 9222246136947933185
  %r0 = insertvalue { i64, i1 } undef, i64 %bv, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
ret.false:
  ret { i64, i1 } { i64 9222246136947933185, i1 false }
}

define { i64, i1 } @jsArrayFromInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %ok = icmp uge i64 %argc, 1
  br i1 %ok, label %go, label %empty
go:
  %src = load i64, ptr %argv
  %has1 = icmp uge i64 %argc, 2
  br i1 %has1, label %r1.b, label %u1.b
r1.b:
  %s1 = getelementptr i64, ptr %argv, i64 1
  %m1 = load i64, ptr %s1
  br label %c2
u1.b:
  br label %c2
c2:
  %mapper = phi i64 [ %m1, %r1.b ], [ 9222246136947933184, %u1.b ]
  %has2 = icmp uge i64 %argc, 3
  br i1 %has2, label %r2.b, label %u2.b
r2.b:
  %s2 = getelementptr i64, ptr %argv, i64 2
  %t2 = load i64, ptr %s2
  br label %do.from
u2.b:
  br label %do.from
do.from:
  %targ = phi i64 [ %t2, %r2.b ], [ 9222246136947933184, %u2.b ]
  %res = call { i64, i1 } @arrayFromValue(i64 %src, i64 %mapper, i64 %targ)
  ret { i64, i1 } %res
empty:
  %e = call ptr @arrayNew(i64 0)
  %ev = call i64 @valueBoxArray(ptr %e)
  %e0 = insertvalue { i64, i1 } undef, i64 %ev, 0
  %e1 = insertvalue { i64, i1 } %e0, i1 false, 1
  ret { i64, i1 } %e1
}

define { i64, i1 } @jsArrayOfInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %frame = call i64 @gcRootSave()
  %arr = call ptr @arrayNew(i64 %argc)
  %av = call i64 @valueBoxArray(ptr %arr)
  call void @gcRootPush(i64 %av)
  br label %fill
fill:
  %i = phi i64 [ 0, %entry ], [ %next, %body ]
  %done = icmp eq i64 %i, %argc
  br i1 %done, label %ret, label %body
body:
  %slot = getelementptr i64, ptr %argv, i64 %i
  %v = load i64, ptr %slot
  call void @arraySet(ptr %arr, i64 %i, i64 %v)
  %next = add i64 %i, 1
  br label %fill
ret:
  call void @gcRootRestore(i64 %frame)
  %r0 = insertvalue { i64, i1 } undef, i64 %av, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
}

define i64 @jsArrayPrototypeObject() {
entry:
  %cached = load i64, ptr @jsArrayProtoObjCache
  %ready = icmp ne i64 %cached, 0
  br i1 %ready, label %ret.cached, label %build
ret.cached:
  ret i64 %cached
build:
  %frame = call i64 @gcRootSave()
  %obj = call ptr @objectNew(i64 4)
  %ov = call i64 @valueBoxObject(ptr %obj)
  call void @gcRootPush(i64 %ov)
  %iter.fn = call i64 @arrayPrototypeMethod(i64 18, ptr @.sym.wk.1)
  call void @objectSet(ptr %obj, i64 18, ptr @.sym.wk.1, i64 %iter.fn)
  store i64 %ov, ptr @jsArrayProtoObjCache
  call void @gcRegisterGlobalRoot(ptr @jsArrayProtoObjCache)
  call void @gcRootRestore(i64 %frame)
  ret i64 %ov
}

define i64 @jsArrayConstructor() {
entry:
  %cached = load i64, ptr @jsArrayCtorCache
  %ready = icmp ne i64 %cached, 0
  br i1 %ready, label %ret.cached, label %build
ret.cached:
  ret i64 %cached
build:
  %frame = call i64 @gcRootSave()
  %name.s = call i64 @valueCopyString(ptr @.arr.n.Array, i64 5)
  call void @gcRootPush(i64 %name.s)
  %ctor = call i64 @functionObjectNew(ptr @jsArrayCtorInvoke, ptr null, i64 9222246136947933184, i64 %name.s, i64 1)
  call void @gcRootPush(i64 %ctor)
  %props = call ptr @objectNew(i64 8)
  %props.v = call i64 @valueBoxObject(ptr %props)
  call void @gcRootPush(i64 %props.v)
  call void @jsAttachMethod(ptr %props, i64 7, ptr @.arr.n.isArray, ptr @jsArrayIsArrayInvoke, i64 1)
  call void @jsAttachMethod(ptr %props, i64 4, ptr @.arr.n.from, ptr @jsArrayFromInvoke, i64 1)
  call void @jsAttachMethod(ptr %props, i64 2, ptr @.arr.n.of, ptr @jsArrayOfInvoke, i64 0)
  %proto = call i64 @jsArrayPrototypeObject()
  call void @objectSet(ptr %props, i64 9, ptr @.obj.n.prototype, i64 %proto)
  call void @functionObjectAttachProperties(i64 %ctor, i64 %props.v)
  store i64 %ctor, ptr @jsArrayCtorCache
  call void @gcRegisterGlobalRoot(ptr @jsArrayCtorCache)
  call void @gcRootRestore(i64 %frame)
  ret i64 %ctor
}

; --- performance.now(), setTimeout, clearTimeout, globalThis ---

@.perf.n.now = private unnamed_addr constant [4 x i8] c"now\00"
@.gt.n.Symbol = private unnamed_addr constant [7 x i8] c"Symbol\00"
@.gt.n.Object = private unnamed_addr constant [7 x i8] c"Object\00"
@.gt.n.Reflect = private unnamed_addr constant [8 x i8] c"Reflect\00"
@.gt.n.Array = private unnamed_addr constant [6 x i8] c"Array\00"
@.gt.n.process = private unnamed_addr constant [8 x i8] c"process\00"
@.gt.n.Buffer = private unnamed_addr constant [7 x i8] c"Buffer\00"
@.gt.n.performance = private unnamed_addr constant [12 x i8] c"performance\00"
@.gt.n.setTimeout = private unnamed_addr constant [11 x i8] c"setTimeout\00"
@.gt.n.clearTimeout = private unnamed_addr constant [13 x i8] c"clearTimeout\00"
@.gt.n.globalThis = private unnamed_addr constant [11 x i8] c"globalThis\00"
@.gt.n.Error = private unnamed_addr constant [6 x i8] c"Error\00"
@.gt.n.BigInt = private unnamed_addr constant [7 x i8] c"BigInt\00"
@.gt.n.Proxy = private unnamed_addr constant [6 x i8] c"Proxy\00"
@.gt.n.Date = private unnamed_addr constant [5 x i8] c"Date\00"
@.gt.n.RegExp = private unnamed_addr constant [7 x i8] c"RegExp\00"
@.gt.n.Int32Array = private unnamed_addr constant [11 x i8] c"Int32Array\00"
@.gt.n.Uint32Array = private unnamed_addr constant [12 x i8] c"Uint32Array\00"
@.gt.n.AbortController = private unnamed_addr constant [16 x i8] c"AbortController\00"
@.gt.n.Intl = private unnamed_addr constant [5 x i8] c"Intl\00"
@.gt.n.Math = private unnamed_addr constant [5 x i8] c"Math\00"
@.gt.n.String = private unnamed_addr constant [7 x i8] c"String\00"
@.gt.n.Number = private unnamed_addr constant [7 x i8] c"Number\00"
@.gt.n.Boolean = private unnamed_addr constant [8 x i8] c"Boolean\00"
@.gt.n.setInterval = private unnamed_addr constant [12 x i8] c"setInterval\00"
@.gt.n.clearInterval = private unnamed_addr constant [14 x i8] c"clearInterval\00"
@.gt.n.Map = private unnamed_addr constant [4 x i8] c"Map\00"
@.gt.n.Set = private unnamed_addr constant [4 x i8] c"Set\00"
@.gt.n.WeakMap = private unnamed_addr constant [8 x i8] c"WeakMap\00"
@.gt.n.WeakSet = private unnamed_addr constant [8 x i8] c"WeakSet\00"
@.gt.n.Uint8Array = private unnamed_addr constant [11 x i8] c"Uint8Array\00"
@.gt.n.Float64Array = private unnamed_addr constant [13 x i8] c"Float64Array\00"
@.gt.n.URL = private unnamed_addr constant [4 x i8] c"URL\00"
@.gt.n.console = private unnamed_addr constant [8 x i8] c"console\00"
@.gt.n.JSON = private unnamed_addr constant [5 x i8] c"JSON\00"

define { i64, i1 } @jsPerformanceNowInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %tv = alloca [2 x i64]
  call i32 @gettimeofday(ptr %tv, ptr null)
  %sec = load i64, ptr %tv
  %usec.slot = getelementptr i64, ptr %tv, i64 1
  %usec = load i64, ptr %usec.slot
  %sec.d = sitofp i64 %sec to double
  %usec.d = sitofp i64 %usec to double
  %ms.sec = fmul double %sec.d, 1000.0
  %ms.usec = fdiv double %usec.d, 1000.0
  %ms = fadd double %ms.sec, %ms.usec
  %boxed = call i64 @valueBoxNumber(double %ms)
  %r0 = insertvalue { i64, i1 } undef, i64 %boxed, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
}

define i64 @jsPerformanceObject() {
entry:
  %cached = load i64, ptr @jsPerfObjCache
  %ready = icmp ne i64 %cached, 0
  br i1 %ready, label %ret.cached, label %build
ret.cached:
  ret i64 %cached
build:
  %frame = call i64 @gcRootSave()
  %obj = call ptr @objectNew(i64 4)
  %ov = call i64 @valueBoxObject(ptr %obj)
  call void @gcRootPush(i64 %ov)
  call void @jsAttachMethod(ptr %obj, i64 3, ptr @.perf.n.now, ptr @jsPerformanceNowInvoke, i64 0)
  store i64 %ov, ptr @jsPerfObjCache
  call void @gcRegisterGlobalRoot(ptr @jsPerfObjCache)
  call void @gcRootRestore(i64 %frame)
  ret i64 %ov
}

define { i64, i1 } @jsSetTimeoutInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  %id = load i64, ptr @jsTimerNextId
  %next = add i64 %id, 1
  store i64 %next, ptr @jsTimerNextId
  %id.d = sitofp i64 %id to double
  %id.v = call i64 @valueBoxNumber(double %id.d)
  %has0 = icmp uge i64 %argc, 1
  br i1 %has0, label %enqueue, label %done
enqueue:
  %cb = load i64, ptr %argv
  %is.fn = call i1 @valueIsFunction(i64 %cb)
  br i1 %is.fn, label %do.enqueue, label %done
do.enqueue:
  call void @microtaskEnqueue(i64 %cb)
  br label %done
done:
  %r0 = insertvalue { i64, i1 } undef, i64 %id.v, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
}

define { i64, i1 } @jsClearTimeoutInvoke(i64 %argc, ptr %argv, ptr %env, i64 %this.val) {
entry:
  ret { i64, i1 } { i64 9222246136947933184, i1 false }
}

define i64 @jsSetTimeoutFn() {
entry:
  %cached = load i64, ptr @jsSetTimeoutCache
  %ready = icmp ne i64 %cached, 0
  br i1 %ready, label %ret.cached, label %build
ret.cached:
  ret i64 %cached
build:
  %fn = call i64 @functionObjectNew(ptr @jsSetTimeoutInvoke, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 2)
  store i64 %fn, ptr @jsSetTimeoutCache
  call void @gcRegisterGlobalRoot(ptr @jsSetTimeoutCache)
  ret i64 %fn
}

define i64 @jsClearTimeoutFn() {
entry:
  %cached = load i64, ptr @jsClearTimeoutCache
  %ready = icmp ne i64 %cached, 0
  br i1 %ready, label %ret.cached, label %build
ret.cached:
  ret i64 %cached
build:
  %fn = call i64 @functionObjectNew(ptr @jsClearTimeoutInvoke, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 1)
  store i64 %fn, ptr @jsClearTimeoutCache
  call void @gcRegisterGlobalRoot(ptr @jsClearTimeoutCache)
  ret i64 %fn
}

define i64 @jsGlobalThisObject() {
entry:
  %cached = load i64, ptr @jsGlobalThisCache
  %ready = icmp ne i64 %cached, 0
  br i1 %ready, label %ret.cached, label %build
ret.cached:
  ret i64 %cached
build:
  %frame = call i64 @gcRootSave()
  %obj = call ptr @objectNew(i64 16)
  %ov = call i64 @valueBoxObject(ptr %obj)
  store i64 %ov, ptr @jsGlobalThisCache
  call void @gcRegisterGlobalRoot(ptr @jsGlobalThisCache)
  call void @gcRootPush(i64 %ov)
  %sym = call i64 @symbolConstructorObject()
  call void @objectSet(ptr %obj, i64 6, ptr @.gt.n.Symbol, i64 %sym)
  %obj.c = call i64 @jsObjectConstructor()
  call void @objectSet(ptr %obj, i64 6, ptr @.gt.n.Object, i64 %obj.c)
  %refl = call i64 @jsReflectObject()
  call void @objectSet(ptr %obj, i64 7, ptr @.gt.n.Reflect, i64 %refl)
  %arr.c = call i64 @jsArrayConstructor()
  call void @objectSet(ptr %obj, i64 5, ptr @.gt.n.Array, i64 %arr.c)
  %proc = call i64 @nodeProcessGet()
  call void @objectSet(ptr %obj, i64 7, ptr @.gt.n.process, i64 %proc)
  %buf = call i64 @nodeBufferObject()
  call void @objectSet(ptr %obj, i64 6, ptr @.gt.n.Buffer, i64 %buf)
  %perf = call i64 @jsPerformanceObject()
  call void @objectSet(ptr %obj, i64 11, ptr @.gt.n.performance, i64 %perf)
  %st = call i64 @jsSetTimeoutFn()
  call void @objectSet(ptr %obj, i64 10, ptr @.gt.n.setTimeout, i64 %st)
  %ct = call i64 @jsClearTimeoutFn()
  call void @objectSet(ptr %obj, i64 12, ptr @.gt.n.clearTimeout, i64 %ct)
  %err = call i64 @errorConstructorValue(i64 1)
  call void @objectSet(ptr %obj, i64 5, ptr @.gt.n.Error, i64 %err)
  %bi = call i64 @jsBigIntConstructor()
  call void @objectSet(ptr %obj, i64 6, ptr @.gt.n.BigInt, i64 %bi)
  %px = call i64 @jsProxyConstructor()
  call void @objectSet(ptr %obj, i64 5, ptr @.gt.n.Proxy, i64 %px)
  %dt = call i64 @jsDateConstructor()
  call void @objectSet(ptr %obj, i64 4, ptr @.gt.n.Date, i64 %dt)
  %re = call i64 @jsRegExpConstructor()
  call void @objectSet(ptr %obj, i64 6, ptr @.gt.n.RegExp, i64 %re)
  %i32 = call i64 @jsInt32ArrayConstructor()
  call void @objectSet(ptr %obj, i64 10, ptr @.gt.n.Int32Array, i64 %i32)
  %u32 = call i64 @jsUint32ArrayConstructor()
  call void @objectSet(ptr %obj, i64 11, ptr @.gt.n.Uint32Array, i64 %u32)
  %ac = call i64 @jsAbortControllerConstructor()
  call void @objectSet(ptr %obj, i64 15, ptr @.gt.n.AbortController, i64 %ac)
  %intl = call i64 @jsIntlObject()
  call void @objectSet(ptr %obj, i64 4, ptr @.gt.n.Intl, i64 %intl)
  %math = call i64 @jsMathObject()
  call void @objectSet(ptr %obj, i64 4, ptr @.gt.n.Math, i64 %math)
  %strc = call i64 @jsStringConstructor()
  call void @objectSet(ptr %obj, i64 6, ptr @.gt.n.String, i64 %strc)
  %numc = call i64 @jsNumberConstructor()
  call void @objectSet(ptr %obj, i64 6, ptr @.gt.n.Number, i64 %numc)
  %boolc = call i64 @jsBooleanConstructor()
  call void @objectSet(ptr %obj, i64 7, ptr @.gt.n.Boolean, i64 %boolc)
  %si = call i64 @jsSetIntervalFn()
  call void @objectSet(ptr %obj, i64 11, ptr @.gt.n.setInterval, i64 %si)
  %ci = call i64 @jsClearIntervalFn()
  call void @objectSet(ptr %obj, i64 13, ptr @.gt.n.clearInterval, i64 %ci)
  %mapc = call i64 @jsMapConstructor()
  call void @objectSet(ptr %obj, i64 3, ptr @.gt.n.Map, i64 %mapc)
  %setc = call i64 @jsSetConstructor()
  call void @objectSet(ptr %obj, i64 3, ptr @.gt.n.Set, i64 %setc)
  %wmc = call i64 @jsWeakMapConstructor()
  call void @objectSet(ptr %obj, i64 7, ptr @.gt.n.WeakMap, i64 %wmc)
  %wsc = call i64 @jsWeakSetConstructor()
  call void @objectSet(ptr %obj, i64 7, ptr @.gt.n.WeakSet, i64 %wsc)
  %u8 = call i64 @jsUint8ArrayConstructor()
  call void @objectSet(ptr %obj, i64 10, ptr @.gt.n.Uint8Array, i64 %u8)
  %f64 = call i64 @jsFloat64ArrayConstructor()
  call void @objectSet(ptr %obj, i64 12, ptr @.gt.n.Float64Array, i64 %f64)
  %urlc = call i64 @jsURLConstructor()
  call void @objectSet(ptr %obj, i64 3, ptr @.gt.n.URL, i64 %urlc)
  %con = call i64 @jsConsoleObject()
  call void @objectSet(ptr %obj, i64 7, ptr @.gt.n.console, i64 %con)
  %jsono = call i64 @jsJsonObject()
  call void @objectSet(ptr %obj, i64 4, ptr @.gt.n.JSON, i64 %jsono)
  call void @objectSet(ptr %obj, i64 10, ptr @.gt.n.globalThis, i64 %ov)
  call void @gcRootRestore(i64 %frame)
  ret i64 %ov
}
