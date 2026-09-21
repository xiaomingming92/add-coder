/*
 * 检索指纹用例 — Plan 轮 2 / Task 2.7
 * 只测纯函数与文件标记读写（不触 DB、不触 jieba 二进制）。
 */
import { describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  TOKENIZATION_CONTRACT_VERSION,
  checkFtsFingerprint,
  computeFtsFingerprint,
  fingerprintMarkerPath,
  readRecordedFingerprint,
  writeRecordedFingerprint,
} from "../../src/lib/memory-fts-fingerprint.js"

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "add-coder-fp-"))
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

describe("检索指纹（分词器 + 词典 + 契约）", () => {
  it("同一输入指纹稳定；jieba 版本变化 → 指纹变化", () => {
    const base = { projectRoot: "/tmp/x", magicDir: ".codex", jiebaVersion: "2.0.3" }
    const a = computeFtsFingerprint(base)
    const b = computeFtsFingerprint(base)
    expect(a.value).toBe(b.value)
    expect(computeFtsFingerprint({ ...base, jiebaVersion: "2.0.4" }).value).not.toBe(a.value)
    expect(a.parts.contract).toBe(TOKENIZATION_CONTRACT_VERSION)
  })

  it("用户词典内容变化 → 指纹变化（词典哈希参与）", () => {
    const { root, cleanup } = fixture()
    try {
      const dictPath = join(root, "userdict.txt")
      writeFileSync(dictPath, "端口 100\n")
      const before = computeFtsFingerprint({ projectRoot: root, magicDir: ".codex", userDictPath: dictPath, jiebaVersion: "2.0.3" })
      writeFileSync(dictPath, "端口 100\n地块 200\n")
      const after = computeFtsFingerprint({ projectRoot: root, magicDir: ".codex", userDictPath: dictPath, jiebaVersion: "2.0.3" })
      expect(after.value).not.toBe(before.value)
      expect(before.parts.userDict).not.toBe("none")
    } finally {
      cleanup()
    }
  })

  it("未记录指纹 → requiresReindex=true（历史 token 来源未知，不假定同源）", () => {
    const { root, cleanup } = fixture()
    try {
      mkdirSync(join(root, ".codex"), { recursive: true })
      const check = checkFtsFingerprint(root, ".codex")
      expect(check.requiresReindex).toBe(true)
      expect(check.reason).toContain("未记录")
    } finally {
      cleanup()
    }
  })

  it("记录后一致 → requiresReindex=false；改词典标记失效 → true 且给出差异明细", () => {
    const { root, cleanup } = fixture()
    try {
      mkdirSync(join(root, ".codex"), { recursive: true })
      const fp = computeFtsFingerprint({ projectRoot: root, magicDir: ".codex", jiebaVersion: "2.0.3" })
      const marker = writeRecordedFingerprint(root, ".codex", fp)
      expect(marker).toBe(fingerprintMarkerPath(root, ".codex"))
      expect(readRecordedFingerprint(root, ".codex")?.fingerprint).toBe(fp.value)
      expect(checkFtsFingerprint(root, ".codex").requiresReindex).toBe(false)

      // 模拟"分词器升级"：写入一个不同指纹的标记
      writeRecordedFingerprint(root, ".codex", { ...fp, value: "deadbeef0000" })
      const after = checkFtsFingerprint(root, ".codex")
      expect(after.requiresReindex).toBe(true)
      expect(after.reason).toContain("指纹不一致")
    } finally {
      cleanup()
    }
  })
})
