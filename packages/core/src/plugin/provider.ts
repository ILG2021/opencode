import { LMStudioPlugin } from "./provider/lmstudio.js"
import { PromptCacheKeyPlugin } from "./provider/prompt-cache-key.js"
import { VLLMPlugin } from "./provider/vllm.js"
import type { PluginInternal } from "./internal.js"

// Local runtimes only: no cloud provider is registered.
export const ProviderPlugins: PluginInternal.InternalPlugin[] = [
  LMStudioPlugin,
  PromptCacheKeyPlugin,
  VLLMPlugin,
]
