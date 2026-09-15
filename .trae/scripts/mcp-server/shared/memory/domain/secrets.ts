/*
 * 密钥/凭证扫描（Plan §11：Evidence 摘录在写入前执行秘密与敏感信息检测）
 * 命中即拒写（ERR_SECRET_DETECTED）。宁可误报，不可漏报。
 */
import { MemoryError } from "./errors.js"

export interface SecretHit {
  pattern: string
  index: number
  preview: string
}

interface SecretPattern {
  name: string
  re: RegExp
}

const PATTERNS: SecretPattern[] = [
  { name: "private-key-block", re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: "aws-access-key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "github-token", re: /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}\b/ },
  { name: "openai-style-key", re: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: "slack-token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: "bearer-token", re: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/i },
  { name: "conn-string-password", re: /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^:\s/]+:[^@\s]+@/i },
  { name: "generic-secret-assign", re: /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token)\b\s*[:=]\s*["'][^"'\s]{8,}["']/i },
  { name: "jwt", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
]

export function scanSecrets(text: string): SecretHit[] {
  const hits: SecretHit[] = []
  for (const p of PATTERNS) {
    const m = p.re.exec(text)
    if (m) {
      hits.push({
        pattern: p.name,
        index: m.index,
        preview: text.slice(Math.max(0, m.index - 10), m.index + 20).replace(/\s+/g, " ").slice(0, 40),
      })
    }
  }
  return hits
}

export function assertNoSecrets(text: string): void {
  const hits = scanSecrets(text)
  if (hits.length > 0) {
    throw new MemoryError("ERR_SECRET_DETECTED", hits.map((h) => h.pattern).join(","))
  }
}
