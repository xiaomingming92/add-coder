// 通用锚点查找：模板脚本统一路径查找入口（单点维护，实现可替换）
// - 依赖 find-up@8（add-coder peerDependencies 强制消费方声明，见 DEPENDENCIES 清单）
// - 本目录由 scripts/package.json "type":"module" 强制 ESM 运行，CJS 消费方项目也适配
import { findUpSync } from "find-up"
import { dirname } from "path"

/**
 * 向上查找首个含指定子目录名的目录（即该子目录的父目录），未命中返回 null。
 * 例：findContainerRootSync(MAGIC_DIR, import.meta.dirname) → 项目根
 */
export function findContainerRootSync(childName: string, fromDir: string): string | null {
  const hit = findUpSync(childName, { cwd: fromDir, type: "directory" });
  return hit ? dirname(hit) : null;
}

/**
 * 向上查找指定名称的目录本身，未命中返回 null。
 */
export function findDirUpSync(name: string, fromDir: string): string | null {
  return findUpSync(name, { cwd: fromDir, type: "directory" }) ?? null;
}
