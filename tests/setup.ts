import { mkdirSync, rmSync, writeFileSync } from "fs"
import { resolve } from "path"

export const TEST_ROOT = resolve(__dirname, "..", ".test-tmp")

export function setupTempDir(): string {
    rmSync(TEST_ROOT, { recursive: true, force: true })
    mkdirSync(TEST_ROOT, { recursive: true })
    // 写入最小 package.json（init 会读 projectName）
    writeFileSync(resolve(TEST_ROOT, "package.json"), JSON.stringify({ name: "test-project" }))
    return TEST_ROOT
}

export function cleanupTempDir(): void {
    rmSync(TEST_ROOT, { recursive: true, force: true })
}

export function fileExists(relPath: string): boolean {
    const { existsSync } = require("fs")
    return existsSync(resolve(TEST_ROOT, relPath))
}

export function readFile(relPath: string): string {
    const { readFileSync } = require("fs")
    return readFileSync(resolve(TEST_ROOT, relPath), "utf-8")
}
