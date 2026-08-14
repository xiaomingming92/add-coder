// state-detect.ts — 兼容入口（bash 版 state-detect.sh 的 TS 同语义实现）
// 状态裁决统一委托 common.ts，禁止维护第二套 magicDir 探测。
// 协议层契约（Review P1 #5）: 仅当前 magicDir scope；禁止跨端扫描与 .add fallback；
// 禁止 adapter 名称默认值（入口注入 MAGIC_DIR 或物理位置推导）。

export * from "./common.js"
