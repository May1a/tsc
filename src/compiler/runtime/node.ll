; Native POSIX Node host runtime: process, Buffer, Uint8Array, node:fs, node:path, node:os, node:child_process.
@environ = external global ptr

@nodeProcessObjectRoot = internal global i64 0
@nodeRawArgc = internal global i32 0
@nodeRawArgv = internal global ptr null
@nodeRawEntryLen = internal global i64 0
@nodeRawEntryPtr = internal global ptr null
@nodeBufferObjectRoot = internal global i64 0
@nodeFsModuleRoot = internal global i64 0
@nodePathModuleRoot = internal global i64 0
@nodeOsModuleRoot = internal global i64 0
@nodeChildProcessModuleRoot = internal global i64 0

@.node.empty = private unnamed_addr constant [1 x i8] c"\00"
@.node.slash = private unnamed_addr constant [2 x i8] c"/\00"
@.node.dot = private unnamed_addr constant [2 x i8] c".\00"
@.node.dotdot = private unnamed_addr constant [3 x i8] c"..\00"
@.node.tmp.env = private unnamed_addr constant [7 x i8] c"TMPDIR\00"
@.node.tmp.default = private unnamed_addr constant [5 x i8] c"/tmp\00"
@.node.mkdtemp.suffix = private unnamed_addr constant [7 x i8] c"XXXXXX\00"
@.node.platform.linux = private unnamed_addr constant [6 x i8] c"linux\00"
@.node.arch.x64 = private unnamed_addr constant [4 x i8] c"x64\00"
@.node.ver.node = private unnamed_addr constant [7 x i8] c"22.0.0\00"
@.node.err.name = private unnamed_addr constant [6 x i8] c"Error\00"
@.node.err.open = private unnamed_addr constant [28 x i8] c"ENOENT: failed to open file\00"
@.node.err.mkdir = private unnamed_addr constant [30 x i8] c"EIO: failed to make directory\00"
@.node.err.mkdtemp = private unnamed_addr constant [35 x i8] c"EIO: failed to make temp directory\00"
@.node.err.spawn = private unnamed_addr constant [22 x i8] c"spawn ENOENT: command\00"

@.node.key.argv = private unnamed_addr constant [5 x i8] c"argv\00"
@.node.key.exit = private unnamed_addr constant [5 x i8] c"exit\00"
@.node.key.cwd = private unnamed_addr constant [4 x i8] c"cwd\00"
@.node.key.env = private unnamed_addr constant [4 x i8] c"env\00"
@.node.key.stdout = private unnamed_addr constant [7 x i8] c"stdout\00"
@.node.key.stderr = private unnamed_addr constant [7 x i8] c"stderr\00"
@.node.key.write = private unnamed_addr constant [6 x i8] c"write\00"
@.node.key.platform = private unnamed_addr constant [9 x i8] c"platform\00"
@.node.key.arch = private unnamed_addr constant [5 x i8] c"arch\00"
@.node.key.versions = private unnamed_addr constant [9 x i8] c"versions\00"
@.node.key.node = private unnamed_addr constant [5 x i8] c"node\00"
@.node.key.byteLength = private unnamed_addr constant [11 x i8] c"byteLength\00"
@.node.key.from = private unnamed_addr constant [5 x i8] c"from\00"
@.node.key.isBuffer = private unnamed_addr constant [9 x i8] c"isBuffer\00"
@.node.key.readFileSync = private unnamed_addr constant [13 x i8] c"readFileSync\00"
@.node.key.writeFileSync = private unnamed_addr constant [14 x i8] c"writeFileSync\00"
@.node.key.mkdirSync = private unnamed_addr constant [10 x i8] c"mkdirSync\00"
@.node.key.mkdtempSync = private unnamed_addr constant [12 x i8] c"mkdtempSync\00"
@.node.key.existsSync = private unnamed_addr constant [11 x i8] c"existsSync\00"
@.node.key.recursive = private unnamed_addr constant [10 x i8] c"recursive\00"
@.node.key.encoding = private unnamed_addr constant [9 x i8] c"encoding\00"
@.node.key.sep = private unnamed_addr constant [4 x i8] c"sep\00"
@.node.key.join = private unnamed_addr constant [5 x i8] c"join\00"
@.node.key.resolve = private unnamed_addr constant [8 x i8] c"resolve\00"
@.node.key.dirname = private unnamed_addr constant [8 x i8] c"dirname\00"
@.node.key.basename = private unnamed_addr constant [9 x i8] c"basename\00"
@.node.key.extname = private unnamed_addr constant [8 x i8] c"extname\00"
@.node.key.parse = private unnamed_addr constant [6 x i8] c"parse\00"
@.node.key.root = private unnamed_addr constant [5 x i8] c"root\00"
@.node.key.dir = private unnamed_addr constant [4 x i8] c"dir\00"
@.node.key.base = private unnamed_addr constant [5 x i8] c"base\00"
@.node.key.ext = private unnamed_addr constant [4 x i8] c"ext\00"
@.node.key.name = private unnamed_addr constant [5 x i8] c"name\00"
@.node.key.tmpdir = private unnamed_addr constant [7 x i8] c"tmpdir\00"
@.node.key.spawnSync = private unnamed_addr constant [10 x i8] c"spawnSync\00"
@.node.key.status = private unnamed_addr constant [7 x i8] c"status\00"
@.node.key.error = private unnamed_addr constant [6 x i8] c"error\00"

define { i64, i1 } @nodeThrowError(ptr %msg.ptr, i64 %msg.len) {
entry:
  %frame = call i64 @gcRootSave()
  %msg = call i64 @valueCopyString(ptr %msg.ptr, i64 %msg.len)
  call void @gcRootPush(i64 %msg)
  %err = call ptr @errorNew(i64 1, i64 5, ptr @.node.err.name, i64 %msg)
  %boxed = call i64 @valueBoxObject(ptr %err)
  %r0 = insertvalue { i64, i1 } undef, i64 %boxed, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 true, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %r1
}

define ptr @nodeToCString(i64 %value) {
entry:
  %text = call { ptr, i64 } @valueToString(i64 %value)
  %src = extractvalue { ptr, i64 } %text, 0
  %len = extractvalue { ptr, i64 } %text, 1
  %size = add i64 %len, 1
  %buf = call ptr @malloc(i64 %size)
  %empty = icmp eq i64 %len, 0
  br i1 %empty, label %nul, label %copy
copy:
  call ptr @memcpy(ptr %buf, ptr %src, i64 %len)
  br label %nul
nul:
  %end = getelementptr i8, ptr %buf, i64 %len
  store i8 0, ptr %end
  ret ptr %buf
}

define i1 @nodeWriteAllFd(i32 %fd, ptr %buf, i64 %len) {
entry:
  br label %loop
loop:
  %off = phi i64 [ 0, %entry ], [ %next.off, %step ]
  %done = icmp uge i64 %off, %len
  br i1 %done, label %ok, label %body
body:
  %rem = sub i64 %len, %off
  %ptr = getelementptr i8, ptr %buf, i64 %off
  %n = call i64 @write(i32 %fd, ptr %ptr, i64 %rem)
  %bad = icmp sle i64 %n, 0
  br i1 %bad, label %fail, label %step
step:
  %next.off = add i64 %off, %n
  br label %loop
ok:
  ret i1 true
fail:
  ret i1 false
}

define { ptr, i64 } @nodeReadAllFd(i32 %fd) {
entry:
  %init.buf = call ptr @malloc(i64 4096)
  br label %loop
loop:
  %buf = phi ptr [ %init.buf, %entry ], [ %cur.buf, %read.more ]
  %len = phi i64 [ 0, %entry ], [ %next.len, %read.more ]
  %cap = phi i64 [ 4096, %entry ], [ %cur.cap, %read.more ]
  %avail = sub i64 %cap, %len
  %need.grow = icmp ule i64 %avail, 1
  br i1 %need.grow, label %grow, label %do.read
grow:
  %grown.cap = mul i64 %cap, 2
  %grown.buf = call ptr @realloc(ptr %buf, i64 %grown.cap)
  br label %do.read
do.read:
  %cur.buf = phi ptr [ %buf, %loop ], [ %grown.buf, %grow ]
  %cur.cap = phi i64 [ %cap, %loop ], [ %grown.cap, %grow ]
  %cur.avail = sub i64 %cur.cap, %len
  %to.read = sub i64 %cur.avail, 1
  %dst = getelementptr i8, ptr %cur.buf, i64 %len
  %n = call i64 @read(i32 %fd, ptr %dst, i64 %to.read)
  %got.data = icmp sgt i64 %n, 0
  br i1 %got.data, label %read.more, label %done
read.more:
  %next.len = add i64 %len, %n
  br label %loop
done:
  %nul.ptr = getelementptr i8, ptr %cur.buf, i64 %len
  store i8 0, ptr %nul.ptr
  %r0 = insertvalue { ptr, i64 } undef, ptr %cur.buf, 0
  %r1 = insertvalue { ptr, i64 } %r0, i64 %len, 1
  ret { ptr, i64 } %r1
}

; ============================================================================
; process
; ============================================================================

define { i64, i1 } @nodeProcessExitMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %arg = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %is.undef = icmp eq i64 %arg, 9222246136947933184
  br i1 %is.undef, label %zero, label %conv
zero:
  call void @exit(i32 0)
  ret { i64, i1 } { i64 9222246136947933184, i1 false }
conv:
  %num = call double @valueToNumber(i64 %arg)
  %code = fptosi double %num to i32
  call void @exit(i32 %code)
  ret { i64, i1 } { i64 9222246136947933184, i1 false }
}

define { i64, i1 } @nodeProcessCwdMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %buf = call ptr @malloc(i64 4096)
  %got = call ptr @getcwd(ptr %buf, i64 4096)
  %ok = icmp ne ptr %got, null
  br i1 %ok, label %success, label %fallback
success:
  %len = call i64 @strlen(ptr %buf)
  %str = call i64 @valueCopyString(ptr %buf, i64 %len)
  call void @free(ptr %buf)
  %r0 = call { i64, i1 } @arrayMethodResult(i64 %str)
  ret { i64, i1 } %r0
fallback:
  call void @free(ptr %buf)
  %dot = call i64 @valueCopyString(ptr @.node.dot, i64 1)
  %r1 = call { i64, i1 } @arrayMethodResult(i64 %dot)
  ret { i64, i1 } %r1
}

define { i64, i1 } @nodeStreamWriteFd(i32 %fd, i64 %argc, ptr %argv) {
entry:
  %arg = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %text = call { ptr, i64 } @valueToString(i64 %arg)
  %ptr = extractvalue { ptr, i64 } %text, 0
  %len = extractvalue { ptr, i64 } %text, 1
  %ok = call i1 @nodeWriteAllFd(i32 %fd, ptr %ptr, i64 %len)
  %boxed = select i1 %ok, i64 9222246136947933186, i64 9222246136947933185
  %res = call { i64, i1 } @arrayMethodResult(i64 %boxed)
  ret { i64, i1 } %res
}

define { i64, i1 } @nodeStdoutWriteMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %res = call { i64, i1 } @nodeStreamWriteFd(i32 1, i64 %argc, ptr %argv)
  ret { i64, i1 } %res
}

define { i64, i1 } @nodeStderrWriteMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %res = call { i64, i1 } @nodeStreamWriteFd(i32 2, i64 %argc, ptr %argv)
  ret { i64, i1 } %res
}

define i64 @nodePopulateEnvObject() {
entry:
  %frame = call i64 @gcRootSave()
  %env.obj = call ptr @objectNew(i64 16)
  %env.boxed = call i64 @valueBoxObject(ptr %env.obj)
  call void @gcRootPush(i64 %env.boxed)
  %envp = load ptr, ptr @environ
  %has.envp = icmp ne ptr %envp, null
  br i1 %has.envp, label %loop, label %done
loop:
  %idx = phi i64 [ 0, %entry ], [ %next.idx, %advance ]
  %slot = getelementptr ptr, ptr %envp, i64 %idx
  %item = load ptr, ptr %slot
  %is.null = icmp eq ptr %item, null
  br i1 %is.null, label %done, label %scan.init
scan.init:
  br label %scan.eq
scan.eq:
  %pos = phi i64 [ 0, %scan.init ], [ %next.pos, %scan.step ]
  %ch.ptr = getelementptr i8, ptr %item, i64 %pos
  %ch = load i8, ptr %ch.ptr
  %is.nul = icmp eq i8 %ch, 0
  br i1 %is.nul, label %advance, label %check.eq
check.eq:
  %is.eq = icmp eq i8 %ch, 61
  br i1 %is.eq, label %store.entry, label %scan.step
scan.step:
  %next.pos = add i64 %pos, 1
  br label %scan.eq
store.entry:
  %val.off = add i64 %pos, 1
  %val.ptr = getelementptr i8, ptr %item, i64 %val.off
  %val.len = call i64 @strlen(ptr %val.ptr)
  %val.boxed = call i64 @valueCopyString(ptr %val.ptr, i64 %val.len)
  call void @objectSet(ptr %env.obj, i64 %pos, ptr %item, i64 %val.boxed)
  br label %advance
advance:
  %next.idx = add i64 %idx, 1
  br label %loop
done:
  call void @gcRootRestore(i64 %frame)
  ret i64 %env.boxed
}

define void @nodeProcessInit(i32 %argc, ptr %argv, i64 %entry.len, ptr %entry.ptr) {
entry:
  store i32 %argc, ptr @nodeRawArgc
  store ptr %argv, ptr @nodeRawArgv
  store i64 %entry.len, ptr @nodeRawEntryLen
  store ptr %entry.ptr, ptr @nodeRawEntryPtr
  ret void
}

define i64 @nodeProcessBuild() {
entry:
  %argc = load i32, ptr @nodeRawArgc
  %argv = load ptr, ptr @nodeRawArgv
  %entry.len = load i64, ptr @nodeRawEntryLen
  %entry.ptr = load ptr, ptr @nodeRawEntryPtr
  %frame = call i64 @gcRootSave()
  %arr = call ptr @arrayNew(i64 0)
  %arr.boxed = call i64 @valueBoxArray(ptr %arr)
  call void @gcRootPush(i64 %arr.boxed)
  %has.argv0 = icmp sgt i32 %argc, 0
  %has.argv.ptr = icmp ne ptr %argv, null
  %can.read.argv0 = and i1 %has.argv0, %has.argv.ptr
  br i1 %can.read.argv0, label %push.argv0, label %push.empty0
push.argv0:
  %a0.ptr = load ptr, ptr %argv
  %a0.len = call i64 @strlen(ptr %a0.ptr)
  %a0.str = call i64 @valueCopyString(ptr %a0.ptr, i64 %a0.len)
  call i64 @arrayPush(ptr %arr, i64 %a0.str)
  br label %push.entry
push.empty0:
  %empty0 = call i64 @valueCopyString(ptr @.node.empty, i64 0)
  call i64 @arrayPush(ptr %arr, i64 %empty0)
  br label %push.entry
push.entry:
  %has.entry = icmp ne ptr %entry.ptr, null
  %use.entry.ptr = select i1 %has.entry, ptr %entry.ptr, ptr @.node.empty
  %use.entry.len = select i1 %has.entry, i64 %entry.len, i64 0
  %entry.str = call i64 @valueCopyString(ptr %use.entry.ptr, i64 %use.entry.len)
  call i64 @arrayPush(ptr %arr, i64 %entry.str)
  %argc64 = sext i32 %argc to i64
  br label %arg.loop
arg.loop:
  %i = phi i64 [ 1, %push.entry ], [ %next.i, %arg.body ]
  %done = icmp sge i64 %i, %argc64
  br i1 %done, label %build.proc, label %arg.body
arg.body:
  %ai.slot = getelementptr ptr, ptr %argv, i64 %i
  %ai.ptr = load ptr, ptr %ai.slot
  %ai.len = call i64 @strlen(ptr %ai.ptr)
  %ai.str = call i64 @valueCopyString(ptr %ai.ptr, i64 %ai.len)
  call i64 @arrayPush(ptr %arr, i64 %ai.str)
  %next.i = add i64 %i, 1
  br label %arg.loop
build.proc:
  %proc = call ptr @objectNew(i64 10)
  %proc.boxed = call i64 @valueBoxObject(ptr %proc)
  store i64 %proc.boxed, ptr @nodeProcessObjectRoot
  call void @gcRegisterGlobalRoot(ptr @nodeProcessObjectRoot)
  call void @objectSet(ptr %proc, i64 4, ptr @.node.key.argv, i64 %arr.boxed)
  %exit.fn = call i64 @functionObjectNew(ptr @nodeProcessExitMethod, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 1)
  call void @objectSet(ptr %proc, i64 4, ptr @.node.key.exit, i64 %exit.fn)
  %cwd.fn = call i64 @functionObjectNew(ptr @nodeProcessCwdMethod, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 0)
  call void @objectSet(ptr %proc, i64 3, ptr @.node.key.cwd, i64 %cwd.fn)
  %env.boxed = call i64 @nodePopulateEnvObject()
  call void @gcRootPush(i64 %env.boxed)
  call void @objectSet(ptr %proc, i64 3, ptr @.node.key.env, i64 %env.boxed)
  %stdout.obj = call ptr @objectNew(i64 1)
  %stdout.boxed = call i64 @valueBoxObject(ptr %stdout.obj)
  call void @gcRootPush(i64 %stdout.boxed)
  %stdout.fn = call i64 @functionObjectNew(ptr @nodeStdoutWriteMethod, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 1)
  call void @objectSet(ptr %stdout.obj, i64 5, ptr @.node.key.write, i64 %stdout.fn)
  call void @objectSet(ptr %proc, i64 6, ptr @.node.key.stdout, i64 %stdout.boxed)
  %stderr.obj = call ptr @objectNew(i64 1)
  %stderr.boxed = call i64 @valueBoxObject(ptr %stderr.obj)
  call void @gcRootPush(i64 %stderr.boxed)
  %stderr.fn = call i64 @functionObjectNew(ptr @nodeStderrWriteMethod, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 1)
  call void @objectSet(ptr %stderr.obj, i64 5, ptr @.node.key.write, i64 %stderr.fn)
  call void @objectSet(ptr %proc, i64 6, ptr @.node.key.stderr, i64 %stderr.boxed)
  %plat = call i64 @valueCopyString(ptr @.node.platform.linux, i64 5)
  call void @objectSet(ptr %proc, i64 8, ptr @.node.key.platform, i64 %plat)
  %arch = call i64 @valueCopyString(ptr @.node.arch.x64, i64 3)
  call void @objectSet(ptr %proc, i64 4, ptr @.node.key.arch, i64 %arch)
  %vers = call ptr @objectNew(i64 1)
  %vers.boxed = call i64 @valueBoxObject(ptr %vers)
  call void @gcRootPush(i64 %vers.boxed)
  %vnode = call i64 @valueCopyString(ptr @.node.ver.node, i64 6)
  call void @objectSet(ptr %vers, i64 4, ptr @.node.key.node, i64 %vnode)
  call void @objectSet(ptr %proc, i64 8, ptr @.node.key.versions, i64 %vers.boxed)
  call void @gcRootRestore(i64 %frame)
  ret i64 %proc.boxed
}

define i64 @nodeProcessGet() {
entry:
  %cached = load i64, ptr @nodeProcessObjectRoot
  %missing = icmp eq i64 %cached, 0
  br i1 %missing, label %init, label %done
init:
  %fresh = call i64 @nodeProcessBuild()
  ret i64 %fresh
done:
  ret i64 %cached
}

; ============================================================================
; Buffer & Uint8Array
; ============================================================================

define { i64, i1 } @nodeBufferByteLengthMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %arg = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %is.str = call i1 @valueIsString(i64 %arg)
  br i1 %is.str, label %from.str, label %check.arr
from.str:
  %slen = call i64 @valueStringLength(i64 %arg)
  br label %finish
check.arr:
  %is.arr = call i1 @valueIsArray(i64 %arg)
  br i1 %is.arr, label %from.arr, label %from.other
from.arr:
  %aptr = call ptr @valueArrayPtr(i64 %arg)
  %alen = call i64 @arrayLength(ptr %aptr)
  br label %finish
from.other:
  %text = call { ptr, i64 } @valueToString(i64 %arg)
  %tlen = extractvalue { ptr, i64 } %text, 1
  br label %finish
finish:
  %len = phi i64 [ %slen, %from.str ], [ %alen, %from.arr ], [ %tlen, %from.other ]
  %num = uitofp i64 %len to double
  %boxed = call i64 @valueBoxNumber(double %num)
  %res = call { i64, i1 } @arrayMethodResult(i64 %boxed)
  ret { i64, i1 } %res
}

define i64 @nodeUint8ArrayNew(i64 %arg) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %arg)
  %is.undef = icmp eq i64 %arg, 9222246136947933184
  br i1 %is.undef, label %empty, label %check.str
empty:
  %earr = call ptr @arrayNew(i64 0)
  %ebox = call i64 @valueBoxArray(ptr %earr)
  call void @gcRootRestore(i64 %frame)
  ret i64 %ebox
check.str:
  %is.str = call i1 @valueIsString(i64 %arg)
  br i1 %is.str, label %from.str, label %check.arr
from.str:
  %sptr = call ptr @valueStringPtr(i64 %arg)
  %slen = call i64 @valueStringLength(i64 %arg)
  %sarr = call ptr @arrayNew(i64 %slen)
  %sbox = call i64 @valueBoxArray(ptr %sarr)
  call void @gcRootPush(i64 %sbox)
  br label %str.loop
str.loop:
  %si = phi i64 [ 0, %from.str ], [ %si.next, %str.body ]
  %sdone = icmp uge i64 %si, %slen
  br i1 %sdone, label %str.done, label %str.body
str.body:
  %sb.ptr = getelementptr i8, ptr %sptr, i64 %si
  %sb = load i8, ptr %sb.ptr
  %sb.d = uitofp i8 %sb to double
  %sb.v = call i64 @valueBoxNumber(double %sb.d)
  call void @arraySet(ptr %sarr, i64 %si, i64 %sb.v)
  %si.next = add i64 %si, 1
  br label %str.loop
str.done:
  call void @gcRootRestore(i64 %frame)
  ret i64 %sbox
check.arr:
  %is.arr = call i1 @valueIsArray(i64 %arg)
  br i1 %is.arr, label %from.arr, label %from.num
from.arr:
  %src = call ptr @valueArrayPtr(i64 %arg)
  %alen = call i64 @arrayLength(ptr %src)
  %copy = call ptr @arraySlice(ptr %src, i64 0, i64 %alen)
  %cbox = call i64 @valueBoxArray(ptr %copy)
  call void @gcRootRestore(i64 %frame)
  ret i64 %cbox
from.num:
  %d = call double @valueToNumber(i64 %arg)
  %n = call i64 @numberToIndex(double %d)
  %neg = icmp slt i64 %n, 0
  %cnt = select i1 %neg, i64 0, i64 %n
  %narr = call ptr @arrayNew(i64 %cnt)
  %nbox = call i64 @valueBoxArray(ptr %narr)
  call void @gcRootPush(i64 %nbox)
  %zero.v = call i64 @valueBoxNumber(double 0.0)
  br label %num.loop
num.loop:
  %ni = phi i64 [ 0, %from.num ], [ %ni.next, %num.body ]
  %ndone = icmp uge i64 %ni, %cnt
  br i1 %ndone, label %num.done, label %num.body
num.body:
  call void @arraySet(ptr %narr, i64 %ni, i64 %zero.v)
  %ni.next = add i64 %ni, 1
  br label %num.loop
num.done:
  call void @gcRootRestore(i64 %frame)
  ret i64 %nbox
}

define { i64, i1 } @nodeBufferFromMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %arg = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %arr = call i64 @nodeUint8ArrayNew(i64 %arg)
  %res = call { i64, i1 } @arrayMethodResult(i64 %arr)
  ret { i64, i1 } %res
}

define { i64, i1 } @nodeBufferIsBufferMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %arg = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %is.arr = call i1 @valueIsArray(i64 %arg)
  %boxed = select i1 %is.arr, i64 9222246136947933186, i64 9222246136947933185
  %res = call { i64, i1 } @arrayMethodResult(i64 %boxed)
  ret { i64, i1 } %res
}

define i64 @nodeBufferObject() {
entry:
  %cached = load i64, ptr @nodeBufferObjectRoot
  %missing = icmp eq i64 %cached, 0
  br i1 %missing, label %create, label %done
create:
  %frame = call i64 @gcRootSave()
  %obj = call ptr @objectNew(i64 4)
  %boxed = call i64 @valueBoxObject(ptr %obj)
  store i64 %boxed, ptr @nodeBufferObjectRoot
  call void @gcRegisterGlobalRoot(ptr @nodeBufferObjectRoot)
  %bl = call i64 @functionObjectNew(ptr @nodeBufferByteLengthMethod, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 2)
  call void @objectSet(ptr %obj, i64 10, ptr @.node.key.byteLength, i64 %bl)
  %fr = call i64 @functionObjectNew(ptr @nodeBufferFromMethod, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 1)
  call void @objectSet(ptr %obj, i64 4, ptr @.node.key.from, i64 %fr)
  %ib = call i64 @functionObjectNew(ptr @nodeBufferIsBufferMethod, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 1)
  call void @objectSet(ptr %obj, i64 8, ptr @.node.key.isBuffer, i64 %ib)
  call void @gcRootRestore(i64 %frame)
  ret i64 %boxed
done:
  ret i64 %cached
}

; ============================================================================
; node:fs
; ============================================================================

define i1 @nodeHasEncodingOption(i64 %opt) {
entry:
  %is.str = call i1 @valueIsString(i64 %opt)
  br i1 %is.str, label %yes, label %check.obj
check.obj:
  %is.obj = call i1 @valueIsObject(i64 %opt)
  br i1 %is.obj, label %read.prop, label %no
read.prop:
  %enc = call i64 @valuePropertyGet(i64 %opt, i64 8, ptr @.node.key.encoding)
  %enc.str = call i1 @valueIsString(i64 %enc)
  ret i1 %enc.str
yes:
  ret i1 true
no:
  ret i1 false
}

define { i64, i1 } @nodeFsReadFileSyncMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %frame = call i64 @gcRootSave()
  %path.val = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %opt.val = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 1)
  %cpath = call ptr @nodeToCString(i64 %path.val)
  %fd = call i32 (ptr, i32, ...) @open(ptr %cpath, i32 0)
  call void @free(ptr %cpath)
  %open.err = icmp slt i32 %fd, 0
  br i1 %open.err, label %fail, label %read.data
fail:
  %err = call { i64, i1 } @nodeThrowError(ptr @.node.err.open, i64 27)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %err
read.data:
  %data = call { ptr, i64 } @nodeReadAllFd(i32 %fd)
  call i32 @close(i32 %fd)
  %buf = extractvalue { ptr, i64 } %data, 0
  %len = extractvalue { ptr, i64 } %data, 1
  %as.str = call i1 @nodeHasEncodingOption(i64 %opt.val)
  br i1 %as.str, label %ret.str, label %ret.bytes
ret.str:
  %boxed.str = call i64 @valueCopyString(ptr %buf, i64 %len)
  call void @free(ptr %buf)
  %r.str = call { i64, i1 } @arrayMethodResult(i64 %boxed.str)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %r.str
ret.bytes:
  %arr = call ptr @arrayNew(i64 %len)
  %arr.box = call i64 @valueBoxArray(ptr %arr)
  call void @gcRootPush(i64 %arr.box)
  br label %byte.loop
byte.loop:
  %bi = phi i64 [ 0, %ret.bytes ], [ %bi.next, %byte.step ]
  %bdone = icmp uge i64 %bi, %len
  br i1 %bdone, label %byte.done, label %byte.step
byte.step:
  %bptr = getelementptr i8, ptr %buf, i64 %bi
  %b = load i8, ptr %bptr
  %bd = uitofp i8 %b to double
  %bv = call i64 @valueBoxNumber(double %bd)
  call void @arraySet(ptr %arr, i64 %bi, i64 %bv)
  %bi.next = add i64 %bi, 1
  br label %byte.loop
byte.done:
  call void @free(ptr %buf)
  %r.bytes = call { i64, i1 } @arrayMethodResult(i64 %arr.box)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %r.bytes
}

define { i64, i1 } @nodeFsWriteFileSyncMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %frame = call i64 @gcRootSave()
  %path.val = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %data.val = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 1)
  call void @gcRootPush(i64 %data.val)
  %cpath = call ptr @nodeToCString(i64 %path.val)
  %fd = call i32 (ptr, i32, ...) @open(ptr %cpath, i32 577, i32 420)
  call void @free(ptr %cpath)
  %open.err = icmp slt i32 %fd, 0
  br i1 %open.err, label %fail, label %check.kind
fail:
  %err = call { i64, i1 } @nodeThrowError(ptr @.node.err.open, i64 27)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %err
check.kind:
  %is.arr = call i1 @valueIsArray(i64 %data.val)
  br i1 %is.arr, label %write.arr, label %write.str
write.arr:
  %arr = call ptr @valueArrayPtr(i64 %data.val)
  %alen = call i64 @arrayLength(ptr %arr)
  %abuf = call ptr @malloc(i64 %alen)
  br label %copy.loop
copy.loop:
  %ci = phi i64 [ 0, %write.arr ], [ %ci.next, %copy.step ]
  %cdone = icmp uge i64 %ci, %alen
  br i1 %cdone, label %copy.done, label %copy.step
copy.step:
  %elem = call i64 @arrayGet(ptr %arr, i64 %ci)
  %ed = call double @valueToNumber(i64 %elem)
  %ei = fptosi double %ed to i64
  %eb = trunc i64 %ei to i8
  %dst = getelementptr i8, ptr %abuf, i64 %ci
  store i8 %eb, ptr %dst
  %ci.next = add i64 %ci, 1
  br label %copy.loop
copy.done:
  call i1 @nodeWriteAllFd(i32 %fd, ptr %abuf, i64 %alen)
  call void @free(ptr %abuf)
  br label %finish
write.str:
  %text = call { ptr, i64 } @valueToString(i64 %data.val)
  %sptr = extractvalue { ptr, i64 } %text, 0
  %slen = extractvalue { ptr, i64 } %text, 1
  call i1 @nodeWriteAllFd(i32 %fd, ptr %sptr, i64 %slen)
  br label %finish
finish:
  call i32 @close(i32 %fd)
  %res = call { i64, i1 } @arrayMethodResult(i64 9222246136947933184)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %res
}

define { i64, i1 } @nodeFsMkdirSyncMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %frame = call i64 @gcRootSave()
  %path.val = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %opt.val = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 1)
  %cpath = call ptr @nodeToCString(i64 %path.val)
  %len = call i64 @strlen(ptr %cpath)
  %is.obj = call i1 @valueIsObject(i64 %opt.val)
  br i1 %is.obj, label %check.rec, label %single
check.rec:
  %rec.v = call i64 @valuePropertyGet(i64 %opt.val, i64 9, ptr @.node.key.recursive)
  %rec = call i1 @valueTruthy(i64 %rec.v)
  br i1 %rec, label %recursive, label %single
recursive:
  br label %rec.loop
rec.loop:
  %pos = phi i64 [ 1, %recursive ], [ %next.pos, %rec.step ]
  %done = icmp uge i64 %pos, %len
  br i1 %done, label %rec.final, label %rec.check
rec.check:
  %ch.ptr = getelementptr i8, ptr %cpath, i64 %pos
  %ch = load i8, ptr %ch.ptr
  %is.sl = icmp eq i8 %ch, 47
  br i1 %is.sl, label %rec.mk, label %rec.step
rec.mk:
  store i8 0, ptr %ch.ptr
  call i32 @mkdir(ptr %cpath, i32 493)
  store i8 47, ptr %ch.ptr
  br label %rec.step
rec.step:
  %next.pos = add i64 %pos, 1
  br label %rec.loop
rec.final:
  call i32 @mkdir(ptr %cpath, i32 493)
  %ok.rec = call i32 @access(ptr %cpath, i32 0)
  call void @free(ptr %cpath)
  %rec.good = icmp eq i32 %ok.rec, 0
  br i1 %rec.good, label %success, label %fail
single:
  %mk = call i32 @mkdir(ptr %cpath, i32 493)
  call void @free(ptr %cpath)
  %good = icmp eq i32 %mk, 0
  br i1 %good, label %success, label %fail
fail:
  %err = call { i64, i1 } @nodeThrowError(ptr @.node.err.mkdir, i64 29)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %err
success:
  %res = call { i64, i1 } @arrayMethodResult(i64 9222246136947933184)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %res
}

define { i64, i1 } @nodeFsMkdtempSyncMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %frame = call i64 @gcRootSave()
  %prefix.val = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %text = call { ptr, i64 } @valueToString(i64 %prefix.val)
  %src = extractvalue { ptr, i64 } %text, 0
  %len = extractvalue { ptr, i64 } %text, 1
  %total = add i64 %len, 7
  %buf = call ptr @malloc(i64 %total)
  call ptr @memcpy(ptr %buf, ptr %src, i64 %len)
  %suffix.dst = getelementptr i8, ptr %buf, i64 %len
  call ptr @memcpy(ptr %suffix.dst, ptr @.node.mkdtemp.suffix, i64 7)
  %got = call ptr @mkdtemp(ptr %buf)
  %bad = icmp eq ptr %got, null
  br i1 %bad, label %fail, label %ok
fail:
  call void @free(ptr %buf)
  %err = call { i64, i1 } @nodeThrowError(ptr @.node.err.mkdtemp, i64 34)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %err
ok:
  %out.len = add i64 %len, 6
  %boxed = call i64 @valueCopyString(ptr %buf, i64 %out.len)
  call void @free(ptr %buf)
  %res = call { i64, i1 } @arrayMethodResult(i64 %boxed)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %res
}

define { i64, i1 } @nodeFsExistsSyncMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %path.val = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %cpath = call ptr @nodeToCString(i64 %path.val)
  %rc = call i32 @access(ptr %cpath, i32 0)
  call void @free(ptr %cpath)
  %exists = icmp eq i32 %rc, 0
  %boxed = select i1 %exists, i64 9222246136947933186, i64 9222246136947933185
  %res = call { i64, i1 } @arrayMethodResult(i64 %boxed)
  ret { i64, i1 } %res
}

define i64 @nodeFsModule() {
entry:
  %cached = load i64, ptr @nodeFsModuleRoot
  %missing = icmp eq i64 %cached, 0
  br i1 %missing, label %create, label %done
create:
  %frame = call i64 @gcRootSave()
  %obj = call ptr @objectNew(i64 6)
  %boxed = call i64 @valueBoxObject(ptr %obj)
  store i64 %boxed, ptr @nodeFsModuleRoot
  call void @gcRegisterGlobalRoot(ptr @nodeFsModuleRoot)
  %rf = call i64 @functionObjectNew(ptr @nodeFsReadFileSyncMethod, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 2)
  call void @objectSet(ptr %obj, i64 12, ptr @.node.key.readFileSync, i64 %rf)
  %wf = call i64 @functionObjectNew(ptr @nodeFsWriteFileSyncMethod, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 2)
  call void @objectSet(ptr %obj, i64 13, ptr @.node.key.writeFileSync, i64 %wf)
  %md = call i64 @functionObjectNew(ptr @nodeFsMkdirSyncMethod, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 2)
  call void @objectSet(ptr %obj, i64 9, ptr @.node.key.mkdirSync, i64 %md)
  %mt = call i64 @functionObjectNew(ptr @nodeFsMkdtempSyncMethod, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 1)
  call void @objectSet(ptr %obj, i64 11, ptr @.node.key.mkdtempSync, i64 %mt)
  %ex = call i64 @functionObjectNew(ptr @nodeFsExistsSyncMethod, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 1)
  call void @objectSet(ptr %obj, i64 10, ptr @.node.key.existsSync, i64 %ex)
  call void @gcRootRestore(i64 %frame)
  ret i64 %boxed
done:
  ret i64 %cached
}

; ============================================================================
; node:os
; ============================================================================

define { i64, i1 } @nodeOsTmpdirMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %env.tmp = call ptr @getenv(ptr @.node.tmp.env)
  %has.env = icmp ne ptr %env.tmp, null
  br i1 %has.env, label %check.nonempty, label %use.default
check.nonempty:
  %elen = call i64 @strlen(ptr %env.tmp)
  %nonempty = icmp ugt i64 %elen, 0
  br i1 %nonempty, label %trim, label %use.default
trim:
  %gt1 = icmp ugt i64 %elen, 1
  br i1 %gt1, label %check.slash, label %copy.env
check.slash:
  %last.idx = sub i64 %elen, 1
  %last.ptr = getelementptr i8, ptr %env.tmp, i64 %last.idx
  %last.ch = load i8, ptr %last.ptr
  %is.sl = icmp eq i8 %last.ch, 47
  %final.len = select i1 %is.sl, i64 %last.idx, i64 %elen
  br label %copy.env
copy.env:
  %use.len = phi i64 [ %elen, %trim ], [ %final.len, %check.slash ]
  %s1 = call i64 @valueCopyString(ptr %env.tmp, i64 %use.len)
  %r1 = call { i64, i1 } @arrayMethodResult(i64 %s1)
  ret { i64, i1 } %r1
use.default:
  %s0 = call i64 @valueCopyString(ptr @.node.tmp.default, i64 4)
  %r0 = call { i64, i1 } @arrayMethodResult(i64 %s0)
  ret { i64, i1 } %r0
}

define i64 @nodeOsModule() {
entry:
  %cached = load i64, ptr @nodeOsModuleRoot
  %missing = icmp eq i64 %cached, 0
  br i1 %missing, label %create, label %done
create:
  %frame = call i64 @gcRootSave()
  %obj = call ptr @objectNew(i64 2)
  %boxed = call i64 @valueBoxObject(ptr %obj)
  store i64 %boxed, ptr @nodeOsModuleRoot
  call void @gcRegisterGlobalRoot(ptr @nodeOsModuleRoot)
  %td = call i64 @functionObjectNew(ptr @nodeOsTmpdirMethod, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 0)
  call void @objectSet(ptr %obj, i64 6, ptr @.node.key.tmpdir, i64 %td)
  call void @gcRootRestore(i64 %frame)
  ret i64 %boxed
done:
  ret i64 %cached
}

; ============================================================================
; node:path
; ============================================================================

define i64 @nodePathNormalize(ptr %raw, i64 %raw.len) {
entry:
  %frame = call i64 @gcRootSave()
  %empty = icmp eq i64 %raw.len, 0
  br i1 %empty, label %ret.dot, label %check.abs
ret.dot:
  %d = call i64 @valueCopyString(ptr @.node.dot, i64 1)
  call void @gcRootRestore(i64 %frame)
  ret i64 %d
check.abs:
  %first = load i8, ptr %raw
  %is.abs = icmp eq i8 %first, 47
  %segs = call ptr @arrayNew(i64 0)
  %segs.box = call i64 @valueBoxArray(ptr %segs)
  call void @gcRootPush(i64 %segs.box)
  br label %seg.loop
seg.loop:
  %pos = phi i64 [ 0, %check.abs ], [ %next.pos, %seg.advance ]
  %done = icmp uge i64 %pos, %raw.len
  br i1 %done, label %build, label %seg.skip.slash
seg.skip.slash:
  %sp = getelementptr i8, ptr %raw, i64 %pos
  %sc = load i8, ptr %sp
  %is.sl = icmp eq i8 %sc, 47
  br i1 %is.sl, label %seg.slash.step, label %seg.find.end
seg.slash.step:
  %sl.next = add i64 %pos, 1
  br label %seg.advance
seg.find.end:
  br label %end.loop
end.loop:
  %ep = phi i64 [ %pos, %seg.find.end ], [ %ep.next, %end.step ]
  %at.end = icmp uge i64 %ep, %raw.len
  br i1 %at.end, label %seg.classify, label %end.check
end.check:
  %ecp = getelementptr i8, ptr %raw, i64 %ep
  %ec = load i8, ptr %ecp
  %ec.sl = icmp eq i8 %ec, 47
  br i1 %ec.sl, label %seg.classify, label %end.step
end.step:
  %ep.next = add i64 %ep, 1
  br label %end.loop
seg.classify:
  %slen = sub i64 %ep, %pos
  %seg.ptr = getelementptr i8, ptr %raw, i64 %pos
  %is.one = icmp eq i64 %slen, 1
  br i1 %is.one, label %check.dot, label %check.two
check.dot:
  %c0 = load i8, ptr %seg.ptr
  %is.dot = icmp eq i8 %c0, 46
  br i1 %is.dot, label %seg.advance, label %push.seg
check.two:
  %is.two = icmp eq i64 %slen, 2
  br i1 %is.two, label %check.dotdot, label %push.seg
check.dotdot:
  %cmp.dd = call i32 @memcmp(ptr %seg.ptr, ptr @.node.dotdot, i64 2)
  %is.dd = icmp eq i32 %cmp.dd, 0
  br i1 %is.dd, label %handle.dd, label %push.seg
handle.dd:
  %cur.cnt = call i64 @arrayLength(ptr %segs)
  %has.prev = icmp ugt i64 %cur.cnt, 0
  br i1 %has.prev, label %check.prev.dd, label %dd.empty
check.prev.dd:
  %prev.idx = sub i64 %cur.cnt, 1
  %prev.val = call i64 @arrayGet(ptr %segs, i64 %prev.idx)
  %prev.len = call i64 @valueStringLength(i64 %prev.val)
  %prev.is.two = icmp eq i64 %prev.len, 2
  br i1 %prev.is.two, label %cmp.prev.dd, label %do.pop
cmp.prev.dd:
  %prev.ptr = call ptr @valueStringPtr(i64 %prev.val)
  %prev.cmp = call i32 @memcmp(ptr %prev.ptr, ptr @.node.dotdot, i64 2)
  %prev.dd = icmp eq i32 %prev.cmp, 0
  br i1 %prev.dd, label %push.seg, label %do.pop
do.pop:
  call i64 @arrayPop(ptr %segs)
  br label %seg.advance
dd.empty:
  br i1 %is.abs, label %seg.advance, label %push.seg
push.seg:
  %seg.str = call i64 @valueCopyString(ptr %seg.ptr, i64 %slen)
  call i64 @arrayPush(ptr %segs, i64 %seg.str)
  br label %seg.advance
seg.advance:
  %next.pos = phi i64 [ %sl.next, %seg.slash.step ], [ %ep, %check.dot ], [ %ep, %do.pop ], [ %ep, %dd.empty ], [ %ep, %push.seg ]
  br label %seg.loop
build:
  %cnt = call i64 @arrayLength(ptr %segs)
  %no.segs = icmp eq i64 %cnt, 0
  br i1 %no.segs, label %build.empty, label %build.join
build.empty:
  %ep.ptr = select i1 %is.abs, ptr @.node.slash, ptr @.node.dot
  %eb = call i64 @valueCopyString(ptr %ep.ptr, i64 1)
  call void @gcRootRestore(i64 %frame)
  ret i64 %eb
build.join:
  %joined = call ptr @arrayJoin(ptr %segs, i64 1, ptr @.node.slash)
  %jlen = call i64 @strlen(ptr %joined)
  br i1 %is.abs, label %prepend.slash, label %ret.rel
prepend.slash:
  %plen = add i64 %jlen, 1
  %pbuf = call ptr @malloc(i64 %plen)
  store i8 47, ptr %pbuf
  %pdst = getelementptr i8, ptr %pbuf, i64 1
  call ptr @memcpy(ptr %pdst, ptr %joined, i64 %jlen)
  %abs.str = call i64 @valueCopyString(ptr %pbuf, i64 %plen)
  call void @free(ptr %pbuf)
  call void @free(ptr %joined)
  call void @gcRootRestore(i64 %frame)
  ret i64 %abs.str
ret.rel:
  %rel.str = call i64 @valueCopyString(ptr %joined, i64 %jlen)
  call void @free(ptr %joined)
  call void @gcRootRestore(i64 %frame)
  ret i64 %rel.str
}

define { i64, i1 } @nodePathJoinMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %frame = call i64 @gcRootSave()
  %parts = call ptr @arrayNew(i64 0)
  %parts.box = call i64 @valueBoxArray(ptr %parts)
  call void @gcRootPush(i64 %parts.box)
  br label %loop
loop:
  %i = phi i64 [ 0, %entry ], [ %next.i, %advance ]
  %done = icmp uge i64 %i, %argc
  br i1 %done, label %join, label %body
body:
  %arg = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 %i)
  %text = call { ptr, i64 } @valueToString(i64 %arg)
  %len = extractvalue { ptr, i64 } %text, 1
  %nonempty = icmp ugt i64 %len, 0
  br i1 %nonempty, label %push, label %advance
push:
  %ptr = extractvalue { ptr, i64 } %text, 0
  %s = call i64 @valueCopyString(ptr %ptr, i64 %len)
  call i64 @arrayPush(ptr %parts, i64 %s)
  br label %advance
advance:
  %next.i = add i64 %i, 1
  br label %loop
join:
  %cnt = call i64 @arrayLength(ptr %parts)
  %none = icmp eq i64 %cnt, 0
  br i1 %none, label %empty, label %norm
empty:
  %dot = call i64 @valueCopyString(ptr @.node.dot, i64 1)
  %r0 = call { i64, i1 } @arrayMethodResult(i64 %dot)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %r0
norm:
  %raw = call ptr @arrayJoin(ptr %parts, i64 1, ptr @.node.slash)
  %rlen = call i64 @strlen(ptr %raw)
  %out = call i64 @nodePathNormalize(ptr %raw, i64 %rlen)
  call void @free(ptr %raw)
  %r1 = call { i64, i1 } @arrayMethodResult(i64 %out)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %r1
}

define { i64, i1 } @nodePathResolveMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %frame = call i64 @gcRootSave()
  %parts = call ptr @arrayNew(i64 0)
  %parts.box = call i64 @valueBoxArray(ptr %parts)
  call void @gcRootPush(i64 %parts.box)
  br label %loop
loop:
  %i = phi i64 [ 0, %entry ], [ %next.i, %advance ]
  %is.abs = phi i1 [ false, %entry ], [ %next.abs, %advance ]
  %done = icmp uge i64 %i, %argc
  br i1 %done, label %check.abs, label %body
body:
  %arg = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 %i)
  %text = call { ptr, i64 } @valueToString(i64 %arg)
  %ptr = extractvalue { ptr, i64 } %text, 0
  %len = extractvalue { ptr, i64 } %text, 1
  %nonempty = icmp ugt i64 %len, 0
  br i1 %nonempty, label %check.leading, label %skip
check.leading:
  %first = load i8, ptr %ptr
  %starts.sl = icmp eq i8 %first, 47
  br i1 %starts.sl, label %reset.abs, label %push.rel
reset.abs:
  call void @arraySetLength(ptr %parts, i64 0)
  %s.abs = call i64 @valueCopyString(ptr %ptr, i64 %len)
  call i64 @arrayPush(ptr %parts, i64 %s.abs)
  br label %advance
push.rel:
  %s.rel = call i64 @valueCopyString(ptr %ptr, i64 %len)
  call i64 @arrayPush(ptr %parts, i64 %s.rel)
  br label %advance
skip:
  br label %advance
advance:
  %next.abs = phi i1 [ true, %reset.abs ], [ %is.abs, %push.rel ], [ %is.abs, %skip ]
  %next.i = add i64 %i, 1
  br label %loop
check.abs:
  br i1 %is.abs, label %finish, label %prepend.cwd
prepend.cwd:
  %cwd.buf = call ptr @malloc(i64 4096)
  %cwd.got = call ptr @getcwd(ptr %cwd.buf, i64 4096)
  %cwd.ok = icmp ne ptr %cwd.got, null
  br i1 %cwd.ok, label %use.cwd, label %use.root
use.cwd:
  %cwd.len = call i64 @strlen(ptr %cwd.buf)
  %cwd.str = call i64 @valueCopyString(ptr %cwd.buf, i64 %cwd.len)
  call void @free(ptr %cwd.buf)
  call i64 @arrayUnshift(ptr %parts, i64 %cwd.str)
  br label %finish
use.root:
  call void @free(ptr %cwd.buf)
  %root.str = call i64 @valueCopyString(ptr @.node.slash, i64 1)
  call i64 @arrayUnshift(ptr %parts, i64 %root.str)
  br label %finish
finish:
  %raw = call ptr @arrayJoin(ptr %parts, i64 1, ptr @.node.slash)
  %rlen = call i64 @strlen(ptr %raw)
  %out = call i64 @nodePathNormalize(ptr %raw, i64 %rlen)
  call void @free(ptr %raw)
  %res = call { i64, i1 } @arrayMethodResult(i64 %out)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %res
}

; Trims trailing slashes (leaving index 1 for root "/").
define i64 @nodePathTrimTrailingSlashes(ptr %ptr, i64 %len) {
entry:
  br label %loop
loop:
  %cur = phi i64 [ %len, %entry ], [ %prev, %step ]
  %gt1 = icmp ugt i64 %cur, 1
  br i1 %gt1, label %check, label %done
check:
  %prev = sub i64 %cur, 1
  %chp = getelementptr i8, ptr %ptr, i64 %prev
  %ch = load i8, ptr %chp
  %is.sl = icmp eq i8 %ch, 47
  br i1 %is.sl, label %step, label %done
step:
  br label %loop
done:
  ret i64 %cur
}

; Returns index of last '/' in ptr[0..len), or -1 if none.
define i64 @nodePathLastSlash(ptr %ptr, i64 %len) {
entry:
  br label %loop
loop:
  %i = phi i64 [ %len, %entry ], [ %prev, %step ]
  %zero = icmp eq i64 %i, 0
  br i1 %zero, label %missing, label %check
check:
  %prev = sub i64 %i, 1
  %chp = getelementptr i8, ptr %ptr, i64 %prev
  %ch = load i8, ptr %chp
  %is.sl = icmp eq i8 %ch, 47
  br i1 %is.sl, label %found, label %step
step:
  br label %loop
found:
  ret i64 %prev
missing:
  ret i64 -1
}

define { i64, i1 } @nodePathDirnameMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %arg = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %text = call { ptr, i64 } @valueToString(i64 %arg)
  %ptr = extractvalue { ptr, i64 } %text, 0
  %len = extractvalue { ptr, i64 } %text, 1
  %empty = icmp eq i64 %len, 0
  br i1 %empty, label %ret.dot, label %scan
scan:
  %trimmed = call i64 @nodePathTrimTrailingSlashes(ptr %ptr, i64 %len)
  %slash = call i64 @nodePathLastSlash(ptr %ptr, i64 %trimmed)
  %none = icmp slt i64 %slash, 0
  br i1 %none, label %ret.dot, label %check.root
check.root:
  %is.root = icmp eq i64 %slash, 0
  br i1 %is.root, label %ret.slash, label %ret.prefix
ret.dot:
  %d = call i64 @valueCopyString(ptr @.node.dot, i64 1)
  %r0 = call { i64, i1 } @arrayMethodResult(i64 %d)
  ret { i64, i1 } %r0
ret.slash:
  %s = call i64 @valueCopyString(ptr @.node.slash, i64 1)
  %r1 = call { i64, i1 } @arrayMethodResult(i64 %s)
  ret { i64, i1 } %r1
ret.prefix:
  %out.len = call i64 @nodePathTrimTrailingSlashes(ptr %ptr, i64 %slash)
  %p = call i64 @valueCopyString(ptr %ptr, i64 %out.len)
  %r2 = call { i64, i1 } @arrayMethodResult(i64 %p)
  ret { i64, i1 } %r2
}

define { i64, i1 } @nodePathBasenameMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %arg = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %ext.arg = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 1)
  %text = call { ptr, i64 } @valueToString(i64 %arg)
  %ptr = extractvalue { ptr, i64 } %text, 0
  %len = extractvalue { ptr, i64 } %text, 1
  %empty = icmp eq i64 %len, 0
  br i1 %empty, label %ret.empty, label %trim
ret.empty:
  %e = call i64 @valueCopyString(ptr @.node.empty, i64 0)
  %re = call { i64, i1 } @arrayMethodResult(i64 %e)
  ret { i64, i1 } %re
trim:
  %trimmed = call i64 @nodePathTrimTrailingSlashes(ptr %ptr, i64 %len)
  %is.only.slash = icmp eq i64 %trimmed, 1
  br i1 %is.only.slash, label %check.root.only, label %extract
check.root.only:
  %c0 = load i8, ptr %ptr
  %eq.sl = icmp eq i8 %c0, 47
  br i1 %eq.sl, label %ret.empty, label %extract
extract:
  %slash = call i64 @nodePathLastSlash(ptr %ptr, i64 %trimmed)
  %start = add i64 %slash, 1
  %base.ptr = getelementptr i8, ptr %ptr, i64 %start
  %base.len = sub i64 %trimmed, %start
  %has.ext = call i1 @valueIsString(i64 %ext.arg)
  br i1 %has.ext, label %strip.ext, label %done
strip.ext:
  %ext.ptr = call ptr @valueStringPtr(i64 %ext.arg)
  %ext.len = call i64 @valueStringLength(i64 %ext.arg)
  %fits = icmp ule i64 %ext.len, %base.len
  %ext.nonempty = icmp ugt i64 %ext.len, 0
  %can.strip = and i1 %fits, %ext.nonempty
  br i1 %can.strip, label %cmp.ext, label %done
cmp.ext:
  %off = sub i64 %base.len, %ext.len
  %tail = getelementptr i8, ptr %base.ptr, i64 %off
  %cmp = call i32 @memcmp(ptr %tail, ptr %ext.ptr, i64 %ext.len)
  %matches = icmp eq i32 %cmp, 0
  %new.len = select i1 %matches, i64 %off, i64 %base.len
  br label %done
done:
  %final.len = phi i64 [ %base.len, %extract ], [ %base.len, %strip.ext ], [ %new.len, %cmp.ext ]
  %out = call i64 @valueCopyString(ptr %base.ptr, i64 %final.len)
  %res = call { i64, i1 } @arrayMethodResult(i64 %out)
  ret { i64, i1 } %res
}

; Finds index of last '.' in base[1..len), or -1 if none (leading dot is not an extension).
define i64 @nodePathExtDotIndex(ptr %base, i64 %len) {
entry:
  %too.short = icmp ule i64 %len, 1
  br i1 %too.short, label %none, label %loop
loop:
  %i = phi i64 [ %len, %entry ], [ %prev, %step ]
  %at.start = icmp ule i64 %i, 1
  br i1 %at.start, label %none, label %check
check:
  %prev = sub i64 %i, 1
  %chp = getelementptr i8, ptr %base, i64 %prev
  %ch = load i8, ptr %chp
  %is.dot = icmp eq i8 %ch, 46
  br i1 %is.dot, label %found, label %step
step:
  br label %loop
found:
  ret i64 %prev
none:
  ret i64 -1
}

define { i64, i1 } @nodePathExtnameMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %arg = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %text = call { ptr, i64 } @valueToString(i64 %arg)
  %ptr = extractvalue { ptr, i64 } %text, 0
  %len = extractvalue { ptr, i64 } %text, 1
  %empty = icmp eq i64 %len, 0
  br i1 %empty, label %ret.empty, label %scan
scan:
  %trimmed = call i64 @nodePathTrimTrailingSlashes(ptr %ptr, i64 %len)
  %slash = call i64 @nodePathLastSlash(ptr %ptr, i64 %trimmed)
  %start = add i64 %slash, 1
  %base.ptr = getelementptr i8, ptr %ptr, i64 %start
  %base.len = sub i64 %trimmed, %start
  %dot = call i64 @nodePathExtDotIndex(ptr %base.ptr, i64 %base.len)
  %has.dot = icmp sgt i64 %dot, 0
  br i1 %has.dot, label %ret.ext, label %ret.empty
ret.ext:
  %ext.ptr = getelementptr i8, ptr %base.ptr, i64 %dot
  %ext.len = sub i64 %base.len, %dot
  %out = call i64 @valueCopyString(ptr %ext.ptr, i64 %ext.len)
  %r1 = call { i64, i1 } @arrayMethodResult(i64 %out)
  ret { i64, i1 } %r1
ret.empty:
  %e = call i64 @valueCopyString(ptr @.node.empty, i64 0)
  %r0 = call { i64, i1 } @arrayMethodResult(i64 %e)
  ret { i64, i1 } %r0
}

define { i64, i1 } @nodePathParseMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %frame = call i64 @gcRootSave()
  %arg = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %text = call { ptr, i64 } @valueToString(i64 %arg)
  %ptr = extractvalue { ptr, i64 } %text, 0
  %len = extractvalue { ptr, i64 } %text, 1
  %obj = call ptr @objectNew(i64 5)
  %boxed = call i64 @valueBoxObject(ptr %obj)
  call void @gcRootPush(i64 %boxed)
  %nonempty = icmp ugt i64 %len, 0
  br i1 %nonempty, label %check.root, label %empty.all
empty.all:
  %e0 = call i64 @valueCopyString(ptr @.node.empty, i64 0)
  call void @objectSet(ptr %obj, i64 4, ptr @.node.key.root, i64 %e0)
  call void @objectSet(ptr %obj, i64 3, ptr @.node.key.dir, i64 %e0)
  call void @objectSet(ptr %obj, i64 4, ptr @.node.key.base, i64 %e0)
  call void @objectSet(ptr %obj, i64 3, ptr @.node.key.ext, i64 %e0)
  call void @objectSet(ptr %obj, i64 4, ptr @.node.key.name, i64 %e0)
  br label %done
check.root:
  %c0 = load i8, ptr %ptr
  %is.abs = icmp eq i8 %c0, 47
  %root.ptr = select i1 %is.abs, ptr @.node.slash, ptr @.node.empty
  %root.len = select i1 %is.abs, i64 1, i64 0
  %root.val = call i64 @valueCopyString(ptr %root.ptr, i64 %root.len)
  call void @objectSet(ptr %obj, i64 4, ptr @.node.key.root, i64 %root.val)
  %trimmed = call i64 @nodePathTrimTrailingSlashes(ptr %ptr, i64 %len)
  %slash = call i64 @nodePathLastSlash(ptr %ptr, i64 %trimmed)
  %has.slash = icmp sge i64 %slash, 0
  br i1 %has.slash, label %set.dir.slash, label %set.dir.empty
set.dir.slash:
  %dir.is.root = icmp eq i64 %slash, 0
  br i1 %dir.is.root, label %dir.root, label %dir.prefix
dir.root:
  %dr = call i64 @valueCopyString(ptr @.node.slash, i64 1)
  call void @objectSet(ptr %obj, i64 3, ptr @.node.key.dir, i64 %dr)
  br label %set.base
dir.prefix:
  %dp.len = call i64 @nodePathTrimTrailingSlashes(ptr %ptr, i64 %slash)
  %dp = call i64 @valueCopyString(ptr %ptr, i64 %dp.len)
  call void @objectSet(ptr %obj, i64 3, ptr @.node.key.dir, i64 %dp)
  br label %set.base
set.dir.empty:
  %de = call i64 @valueCopyString(ptr @.node.empty, i64 0)
  call void @objectSet(ptr %obj, i64 3, ptr @.node.key.dir, i64 %de)
  br label %set.base
set.base:
  %start = add i64 %slash, 1
  %base.ptr = getelementptr i8, ptr %ptr, i64 %start
  %base.len = sub i64 %trimmed, %start
  %base.val = call i64 @valueCopyString(ptr %base.ptr, i64 %base.len)
  call void @objectSet(ptr %obj, i64 4, ptr @.node.key.base, i64 %base.val)
  %dot = call i64 @nodePathExtDotIndex(ptr %base.ptr, i64 %base.len)
  %has.dot = icmp sgt i64 %dot, 0
  br i1 %has.dot, label %with.ext, label %no.ext
with.ext:
  %ext.ptr = getelementptr i8, ptr %base.ptr, i64 %dot
  %ext.len = sub i64 %base.len, %dot
  %ext.val = call i64 @valueCopyString(ptr %ext.ptr, i64 %ext.len)
  call void @objectSet(ptr %obj, i64 3, ptr @.node.key.ext, i64 %ext.val)
  %name.val = call i64 @valueCopyString(ptr %base.ptr, i64 %dot)
  call void @objectSet(ptr %obj, i64 4, ptr @.node.key.name, i64 %name.val)
  br label %done
no.ext:
  %no.ext.val = call i64 @valueCopyString(ptr @.node.empty, i64 0)
  call void @objectSet(ptr %obj, i64 3, ptr @.node.key.ext, i64 %no.ext.val)
  call void @objectSet(ptr %obj, i64 4, ptr @.node.key.name, i64 %base.val)
  br label %done
done:
  %res = call { i64, i1 } @arrayMethodResult(i64 %boxed)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %res
}

define i64 @nodePathModule() {
entry:
  %cached = load i64, ptr @nodePathModuleRoot
  %missing = icmp eq i64 %cached, 0
  br i1 %missing, label %create, label %done
create:
  %frame = call i64 @gcRootSave()
  %obj = call ptr @objectNew(i64 8)
  %boxed = call i64 @valueBoxObject(ptr %obj)
  store i64 %boxed, ptr @nodePathModuleRoot
  call void @gcRegisterGlobalRoot(ptr @nodePathModuleRoot)
  %sep = call i64 @valueCopyString(ptr @.node.slash, i64 1)
  call void @objectSet(ptr %obj, i64 3, ptr @.node.key.sep, i64 %sep)
  %jn = call i64 @functionObjectNew(ptr @nodePathJoinMethod, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 0)
  call void @objectSet(ptr %obj, i64 4, ptr @.node.key.join, i64 %jn)
  %rs = call i64 @functionObjectNew(ptr @nodePathResolveMethod, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 0)
  call void @objectSet(ptr %obj, i64 7, ptr @.node.key.resolve, i64 %rs)
  %dn = call i64 @functionObjectNew(ptr @nodePathDirnameMethod, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 1)
  call void @objectSet(ptr %obj, i64 7, ptr @.node.key.dirname, i64 %dn)
  %bn = call i64 @functionObjectNew(ptr @nodePathBasenameMethod, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 2)
  call void @objectSet(ptr %obj, i64 8, ptr @.node.key.basename, i64 %bn)
  %en = call i64 @functionObjectNew(ptr @nodePathExtnameMethod, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 1)
  call void @objectSet(ptr %obj, i64 7, ptr @.node.key.extname, i64 %en)
  %pr = call i64 @functionObjectNew(ptr @nodePathParseMethod, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 1)
  call void @objectSet(ptr %obj, i64 5, ptr @.node.key.parse, i64 %pr)
  call void @gcRootRestore(i64 %frame)
  ret i64 %boxed
done:
  ret i64 %cached
}

; ============================================================================
; node:child_process
; ============================================================================

define { i64, i1 } @nodeSpawnSyncMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %frame = call i64 @gcRootSave()
  %cmd.val = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 0)
  %args.val = call i64 @arrayMethodArgument(i64 %argc, ptr %argv, i64 1)
  call void @gcRootPush(i64 %cmd.val)
  call void @gcRootPush(i64 %args.val)
  %ccmd = call ptr @nodeToCString(i64 %cmd.val)
  %args.is.arr = call i1 @valueIsArray(i64 %args.val)
  br i1 %args.is.arr, label %count.args, label %zero.args
count.args:
  %args.ptr = call ptr @valueArrayPtr(i64 %args.val)
  %acnt = call i64 @arrayLength(ptr %args.ptr)
  br label %alloc.argv
zero.args:
  br label %alloc.argv
alloc.argv:
  %nargs = phi i64 [ %acnt, %count.args ], [ 0, %zero.args ]
  %total.ptrs = add i64 %nargs, 2
  %argv.bytes = mul i64 %total.ptrs, 8
  %cargv = call ptr @malloc(i64 %argv.bytes)
  store ptr %ccmd, ptr %cargv
  br label %fill.argv
fill.argv:
  %ai = phi i64 [ 0, %alloc.argv ], [ %ai.next, %fill.step ]
  %adone = icmp uge i64 %ai, %nargs
  br i1 %adone, label %term.argv, label %fill.step
fill.step:
  %arr.for.arg = call ptr @valueArrayPtr(i64 %args.val)
  %aval = call i64 @arrayGet(ptr %arr.for.arg, i64 %ai)
  %astr = call ptr @nodeToCString(i64 %aval)
  %dst.idx = add i64 %ai, 1
  %dst.slot = getelementptr ptr, ptr %cargv, i64 %dst.idx
  store ptr %astr, ptr %dst.slot
  %ai.next = add i64 %ai, 1
  br label %fill.argv
term.argv:
  %null.idx = add i64 %nargs, 1
  %null.slot = getelementptr ptr, ptr %cargv, i64 %null.idx
  store ptr null, ptr %null.slot
  %out.pipe = alloca [2 x i32]
  %err.pipe = alloca [2 x i32]
  %exec.pipe = alloca [2 x i32]
  call i32 @pipe(ptr %out.pipe)
  call i32 @pipe(ptr %err.pipe)
  call i32 @pipe(ptr %exec.pipe)
  %out.r.ptr = getelementptr [2 x i32], ptr %out.pipe, i64 0, i64 0
  %out.w.ptr = getelementptr [2 x i32], ptr %out.pipe, i64 0, i64 1
  %err.r.ptr = getelementptr [2 x i32], ptr %err.pipe, i64 0, i64 0
  %err.w.ptr = getelementptr [2 x i32], ptr %err.pipe, i64 0, i64 1
  %exc.r.ptr = getelementptr [2 x i32], ptr %exec.pipe, i64 0, i64 0
  %exc.w.ptr = getelementptr [2 x i32], ptr %exec.pipe, i64 0, i64 1
  %out.r = load i32, ptr %out.r.ptr
  %out.w = load i32, ptr %out.w.ptr
  %err.r = load i32, ptr %err.r.ptr
  %err.w = load i32, ptr %err.w.ptr
  %exc.r = load i32, ptr %exc.r.ptr
  %exc.w = load i32, ptr %exc.w.ptr
  call i32 (i32, i32, ...) @fcntl(i32 %exc.w, i32 2, i32 1)
  call i32 @fflush(ptr null)
  %pid = call i32 @fork()
  %is.child = icmp eq i32 %pid, 0
  br i1 %is.child, label %child, label %parent
child:
  call i32 @close(i32 %out.r)
  call i32 @close(i32 %err.r)
  call i32 @close(i32 %exc.r)
  call i32 @dup2(i32 %out.w, i32 1)
  call i32 @dup2(i32 %err.w, i32 2)
  call i32 @close(i32 %out.w)
  call i32 @close(i32 %err.w)
  call i32 @execvp(ptr %ccmd, ptr %cargv)
  %marker = alloca i8
  store i8 1, ptr %marker
  call i64 @write(i32 %exc.w, ptr %marker, i64 1)
  call i32 @close(i32 %exc.w)
  call void @exit(i32 127)
  unreachable
parent:
  call i32 @close(i32 %out.w)
  call i32 @close(i32 %err.w)
  call i32 @close(i32 %exc.w)
  %out.data = call { ptr, i64 } @nodeReadAllFd(i32 %out.r)
  call i32 @close(i32 %out.r)
  %err.data = call { ptr, i64 } @nodeReadAllFd(i32 %err.r)
  call i32 @close(i32 %err.r)
  %exec.flag = alloca i8
  %exec.n = call i64 @read(i32 %exc.r, ptr %exec.flag, i64 1)
  call i32 @close(i32 %exc.r)
  %wstatus.slot = alloca i32
  store i32 0, ptr %wstatus.slot
  call i32 @waitpid(i32 %pid, ptr %wstatus.slot, i32 0)
  br label %free.argv
free.argv:
  %fi = phi i64 [ 0, %parent ], [ %fi.next, %free.step ]
  %fcount = add i64 %nargs, 1
  %fdone = icmp uge i64 %fi, %fcount
  br i1 %fdone, label %free.cargv, label %free.step
free.step:
  %fslot = getelementptr ptr, ptr %cargv, i64 %fi
  %fstr = load ptr, ptr %fslot
  call void @free(ptr %fstr)
  %fi.next = add i64 %fi, 1
  br label %free.argv
free.cargv:
  call void @free(ptr %cargv)
  %res.obj = call ptr @objectNew(i64 4)
  %res.box = call i64 @valueBoxObject(ptr %res.obj)
  call void @gcRootPush(i64 %res.box)
  %out.ptr = extractvalue { ptr, i64 } %out.data, 0
  %out.len = extractvalue { ptr, i64 } %out.data, 1
  %out.str = call i64 @valueCopyString(ptr %out.ptr, i64 %out.len)
  call void @free(ptr %out.ptr)
  call void @objectSet(ptr %res.obj, i64 6, ptr @.node.key.stdout, i64 %out.str)
  %err.ptr = extractvalue { ptr, i64 } %err.data, 0
  %err.len = extractvalue { ptr, i64 } %err.data, 1
  %err.str = call i64 @valueCopyString(ptr %err.ptr, i64 %err.len)
  call void @free(ptr %err.ptr)
  call void @objectSet(ptr %res.obj, i64 6, ptr @.node.key.stderr, i64 %err.str)
  %spawn.failed = icmp sgt i64 %exec.n, 0
  br i1 %spawn.failed, label %set.spawn.err, label %set.status
set.spawn.err:
  %emsg = call i64 @valueCopyString(ptr @.node.err.spawn, i64 21)
  call void @gcRootPush(i64 %emsg)
  %eobj = call ptr @errorNew(i64 1, i64 5, ptr @.node.err.name, i64 %emsg)
  %ebox = call i64 @valueBoxObject(ptr %eobj)
  call void @objectSet(ptr %res.obj, i64 5, ptr @.node.key.error, i64 %ebox)
  call void @objectSet(ptr %res.obj, i64 6, ptr @.node.key.status, i64 9222246136947933187)
  br label %done
set.status:
  %ws = load i32, ptr %wstatus.slot
  %sig = and i32 %ws, 127
  %exited = icmp eq i32 %sig, 0
  br i1 %exited, label %set.exit.code, label %set.null.status
set.exit.code:
  %shifted = lshr i32 %ws, 8
  %code32 = and i32 %shifted, 255
  %code.d = uitofp i32 %code32 to double
  %code.v = call i64 @valueBoxNumber(double %code.d)
  call void @objectSet(ptr %res.obj, i64 6, ptr @.node.key.status, i64 %code.v)
  br label %done
set.null.status:
  call void @objectSet(ptr %res.obj, i64 6, ptr @.node.key.status, i64 9222246136947933187)
  br label %done
done:
  %ret = call { i64, i1 } @arrayMethodResult(i64 %res.box)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %ret
}

define i64 @nodeChildProcessModule() {
entry:
  %cached = load i64, ptr @nodeChildProcessModuleRoot
  %missing = icmp eq i64 %cached, 0
  br i1 %missing, label %create, label %done
create:
  %frame = call i64 @gcRootSave()
  %obj = call ptr @objectNew(i64 2)
  %boxed = call i64 @valueBoxObject(ptr %obj)
  store i64 %boxed, ptr @nodeChildProcessModuleRoot
  call void @gcRegisterGlobalRoot(ptr @nodeChildProcessModuleRoot)
  %sp = call i64 @functionObjectNew(ptr @nodeSpawnSyncMethod, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 3)
  call void @objectSet(ptr %obj, i64 9, ptr @.node.key.spawnSync, i64 %sp)
  call void @gcRootRestore(i64 %frame)
  ret i64 %boxed
done:
  ret i64 %cached
}
