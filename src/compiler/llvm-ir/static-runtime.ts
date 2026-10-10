export interface StaticRuntimeFragment {
  readonly origin: string;
  readonly text: string;
}

export interface LlvmModuleOptions {
  readonly staticRuntime: readonly StaticRuntimeFragment[];
}
