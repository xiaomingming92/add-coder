/*
 * Author       : xiaomingming wujixmm@gmail.com
 * Date         : 2026-08-07 10:30:00
 * Description  : 跨平台路径规范化工具（issue #10 P0-3/P1-4 修复基础设施）
 *                Windows 渲染路径使用反斜杠，PATCH_GUARD/stack 筛选/hash key
 *                等参与比较的路径必须统一为 POSIX 格式，避免分隔符假设。
 */
/**
 * 相对路径统一为 POSIX 格式（反斜杠→正斜杠）。
 * 幂等：POSIX 输入原样返回；空串返回空串。
 * 供 isUserData / stack 筛选 / hash key 等所有参与比较的路径使用。
 */
export function normalizeRelPath(p: string): string {
    return p.replaceAll("\\", "/");
}
