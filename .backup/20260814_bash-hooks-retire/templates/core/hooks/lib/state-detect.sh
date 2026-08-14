#!/bin/bash
# state-detect.sh — 兼容入口；状态裁决统一委托 common.sh，禁止维护第二套 magicDir 探测。
# 协议层契约（Review P1 #5）: 仅当前 magicDir scope；禁止跨端扫描与 .add fallback；
# 禁止 adapter 名称默认值（入口注入 MAGIC_DIR 或物理位置推导）。

if ! type detect_active_add >/dev/null 2>&1; then
  HOOK_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  # shellcheck source=common.sh
  source "$HOOK_LIB_DIR/common.sh"
fi
