#!/usr/bin/env bash
# Enforce the "no source file over 1,000 lines" rule. Scans tracked TS/TSX
# source under src/ (AsciiDoc/Markdown/JSON/config etc. are not application code
# and are excluded by the extension + path filter).
#
# Grandfather-aware: the files already over the cap when the rule landed are
# baselined below. They are allowed to exist BUT MUST NOT GROW — extract, don't
# append. Any *new* file over the cap, or any baselined file that grows past its
# recorded size, fails the build.
set -euo pipefail

LIMIT=1000

# Baseline of pre-existing over-cap files (path -> max allowed lines = the count
# when the rule landed, 2026-06-29). Shrink these over time and lower the number
# here; never raise it. Delete the entry once a file drops under the cap.
#
# Implemented as a case-based lookup rather than a `declare -A` associative array
# so the script runs on Bash 3.2 (macOS default) as well as Bash 4+ (CI/Linux).
# Echo the max allowed lines for a baselined path, or nothing if not baselined.
baseline_for() {
  case "$1" in
    "src/components/DMProvider.tsx") echo 1652 ;;
    *) echo "" ;;
  esac
}

# GitHub Actions error annotation when running in CI; plain echo locally.
emit_error() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::error file=$1::$2"; else echo "ERROR: $1 — $2"; fi
}

fail=0
while IFS= read -r f; do
  [ -f "$f" ] || continue
  lines=$(wc -l < "$f" | tr -d ' ')
  base="$(baseline_for "$f")"
  if [ -n "$base" ]; then
    if [ "$lines" -gt "$base" ]; then
      emit_error "$f" "grew to ${lines} lines (baseline ${base}). Over-cap files must shrink, not grow — extract logic into its own module, don't append."
      fail=1
    fi
  elif [ "$lines" -gt "$LIMIT" ]; then
    emit_error "$f" "${lines} lines exceeds the ${LIMIT}-line cap. Split it into logically-cohesive modules."
    fail=1
  fi
done < <(git ls-files -- src | grep -E '\.(ts|tsx)$')

if [ "$fail" -eq 0 ]; then
  echo "✓ file-size check passed (no new files over ${LIMIT} lines; baselined files did not grow)"
fi
exit "$fail"
