#!/bin/bash
# subagent-guard.sh — SubagentStart/Stop 门禁日志
set -euo pipefail
input=$(cat)
agent_type=$(echo "$input" | jq -r '.agent_type // ""')
hook_event=$(echo "$input" | jq -r '.hook_event_name // ""')

if echo "$agent_type" | grep -qiE 'guardian|orchestrator'; then
  echo "[ADD Subagent] ${hook_event}: ${agent_type}"
fi
exit 0
