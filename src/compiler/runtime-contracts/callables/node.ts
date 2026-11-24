// Generated from Static Runtime IR. Run npm run runtime:contracts to regenerate.
import type { LlvmModuleBuilder } from "../../llvm-ir/index.js";
import { nodeContracts } from "../node.js";
import { type RuntimeCalleeTable, registerRuntimeContract } from "../register.js";

export function createNodeCallees(module: LlvmModuleBuilder): RuntimeCalleeTable<typeof nodeContracts> {
  return {
    "nodeThrowError": registerRuntimeContract(module, nodeContracts.nodeThrowError),
    "nodeToCString": registerRuntimeContract(module, nodeContracts.nodeToCString),
    "nodeWriteAllFd": registerRuntimeContract(module, nodeContracts.nodeWriteAllFd),
    "nodeReadAllFd": registerRuntimeContract(module, nodeContracts.nodeReadAllFd),
    "nodeProcessExitMethod": registerRuntimeContract(module, nodeContracts.nodeProcessExitMethod),
    "nodeProcessCwdMethod": registerRuntimeContract(module, nodeContracts.nodeProcessCwdMethod),
    "nodeStreamWriteFd": registerRuntimeContract(module, nodeContracts.nodeStreamWriteFd),
    "nodeStdoutWriteMethod": registerRuntimeContract(module, nodeContracts.nodeStdoutWriteMethod),
    "nodeStderrWriteMethod": registerRuntimeContract(module, nodeContracts.nodeStderrWriteMethod),
    "nodePopulateEnvObject": registerRuntimeContract(module, nodeContracts.nodePopulateEnvObject),
    "nodeProcessInit": registerRuntimeContract(module, nodeContracts.nodeProcessInit),
    "nodeProcessBuild": registerRuntimeContract(module, nodeContracts.nodeProcessBuild),
    "nodeProcessGet": registerRuntimeContract(module, nodeContracts.nodeProcessGet),
    "nodeBufferByteLengthMethod": registerRuntimeContract(module, nodeContracts.nodeBufferByteLengthMethod),
    "nodeUint8ArrayNew": registerRuntimeContract(module, nodeContracts.nodeUint8ArrayNew),
    "nodeBufferFromMethod": registerRuntimeContract(module, nodeContracts.nodeBufferFromMethod),
    "nodeBufferIsBufferMethod": registerRuntimeContract(module, nodeContracts.nodeBufferIsBufferMethod),
    "nodeBufferObject": registerRuntimeContract(module, nodeContracts.nodeBufferObject),
    "nodeHasEncodingOption": registerRuntimeContract(module, nodeContracts.nodeHasEncodingOption),
    "nodeFsReadFileSyncMethod": registerRuntimeContract(module, nodeContracts.nodeFsReadFileSyncMethod),
    "nodeFsWriteFileSyncMethod": registerRuntimeContract(module, nodeContracts.nodeFsWriteFileSyncMethod),
    "nodeFsMkdirSyncMethod": registerRuntimeContract(module, nodeContracts.nodeFsMkdirSyncMethod),
    "nodeFsMkdtempSyncMethod": registerRuntimeContract(module, nodeContracts.nodeFsMkdtempSyncMethod),
    "nodeFsExistsSyncMethod": registerRuntimeContract(module, nodeContracts.nodeFsExistsSyncMethod),
    "nodeFsModule": registerRuntimeContract(module, nodeContracts.nodeFsModule),
    "nodeOsTmpdirMethod": registerRuntimeContract(module, nodeContracts.nodeOsTmpdirMethod),
    "nodeOsModule": registerRuntimeContract(module, nodeContracts.nodeOsModule),
    "nodePathNormalize": registerRuntimeContract(module, nodeContracts.nodePathNormalize),
    "nodePathJoinMethod": registerRuntimeContract(module, nodeContracts.nodePathJoinMethod),
    "nodePathResolveMethod": registerRuntimeContract(module, nodeContracts.nodePathResolveMethod),
    "nodePathTrimTrailingSlashes": registerRuntimeContract(module, nodeContracts.nodePathTrimTrailingSlashes),
    "nodePathLastSlash": registerRuntimeContract(module, nodeContracts.nodePathLastSlash),
    "nodePathDirnameMethod": registerRuntimeContract(module, nodeContracts.nodePathDirnameMethod),
    "nodePathBasenameMethod": registerRuntimeContract(module, nodeContracts.nodePathBasenameMethod),
    "nodePathExtDotIndex": registerRuntimeContract(module, nodeContracts.nodePathExtDotIndex),
    "nodePathExtnameMethod": registerRuntimeContract(module, nodeContracts.nodePathExtnameMethod),
    "nodePathParseMethod": registerRuntimeContract(module, nodeContracts.nodePathParseMethod),
    "nodePathModule": registerRuntimeContract(module, nodeContracts.nodePathModule),
    "nodeSpawnSyncMethod": registerRuntimeContract(module, nodeContracts.nodeSpawnSyncMethod),
    "nodeChildProcessModule": registerRuntimeContract(module, nodeContracts.nodeChildProcessModule),
  };
}
