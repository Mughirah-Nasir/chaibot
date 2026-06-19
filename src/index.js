/**
 * Public API for ChaiBot's Node core.
 */

export { analyzePosting } from "./detector/index.js";
export { normalizePosting } from "./detector/normalize.js";
export { evaluate } from "./detector/engine.js";
export { ALL_RULES, RULES_BY_ID } from "./detector/rules.js";
export { buildOfflineProposal } from "./proposal/offline.js";
export { generateProposal, buildProposalPrompt } from "./proposal/index.js";
export { createProvider, OpenAIProvider, AnthropicProvider } from "./providers/remote.js";
export { ReplayProvider } from "./providers/replay.js";
export { ProviderError } from "./providers/base.js";
