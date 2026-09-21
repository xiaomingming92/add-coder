// memory-fts-fingerprint.ts — 指纹逻辑真源在 templates（随包分发），此处仅为仓根上下文的再导出。
//
// 为什么再导出：MCP 工具（templates 侧）与 CLI（src 侧）必须用**同一份**指纹实现；
// 把实现放 templates、仓根只做 re-export，既满足分发（六端用户项目有这份代码），
// 又避免"工具一份、CLI 一份"的漂移（ADD-12 双源头漂移）。
export {
  TOKENIZATION_CONTRACT_VERSION,
  computeFtsFingerprint,
  detectJiebaVersion,
  fingerprintMarkerPath,
  readRecordedFingerprint,
  writeRecordedFingerprint,
  checkFtsFingerprint,
} from "../../templates/core/scripts/mcp-server/shared/memory/retrieval/fts-fingerprint.js"
export type { FtsFingerprint, RecordedFingerprint, FingerprintCheck } from "../../templates/core/scripts/mcp-server/shared/memory/retrieval/fts-fingerprint.js"
