#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="${ROOT}/.audit/roadmap-build.tsv"
phase="$1"; decision="$2"; why="$3"; evidence="$4"; result="$5"
ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
sanitize() { printf "%s" "$1" | tr "\t\n\r" "   "; }
printf "%s\t%s\t%s\t%s\t%s\t%s\n" "$ts" "$(sanitize "$phase")" "$(sanitize "$decision")" "$(sanitize "$why")" "$(sanitize "$evidence")" "$(sanitize "$result")" >> "$LOG"

