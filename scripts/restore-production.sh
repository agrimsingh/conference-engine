#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DB_NAME="${CE_D1_DATABASE:-conference-engine}"
R2_BUCKET="${CE_R2_BUCKET:-conference-engine-assets}"
BACKUP_DIR=""
TARGET="local"
CONFIRM=""

usage() {
	cat <<EOF
Usage: $(basename "$0") <backup-directory> --target local|remote [--confirm I_UNDERSTAND_PRODUCTION]

Imports d1.sql from a backup directory created by backup-production.sh.
Remote restores require --confirm I_UNDERSTAND_PRODUCTION.

Optional R2 restore copies every key listed in r2-manifest.tsv from
<backup-directory>/r2-objects/<key> into ${R2_BUCKET}. Missing local
object files are skipped with a warning.

Environment overrides:
  CE_D1_DATABASE   D1 database name (default: ${DB_NAME})
  CE_R2_BUCKET     R2 bucket name (default: ${R2_BUCKET})
EOF
}

while [[ $# -gt 0 ]]; do
	case "$1" in
		-h | --help)
			usage
			exit 0
			;;
		--target)
			TARGET="${2:-}"
			shift 2
			;;
		--confirm)
			CONFIRM="${2:-}"
			shift 2
			;;
		-*)
			echo "Unknown option: $1" >&2
			usage >&2
			exit 1
			;;
		*)
			if [[ -z "$BACKUP_DIR" ]]; then
				BACKUP_DIR="$1"
				shift
			else
				echo "Unexpected argument: $1" >&2
				usage >&2
				exit 1
			fi
			;;
	esac
done

if [[ -z "$BACKUP_DIR" || ! -d "$BACKUP_DIR" ]]; then
	echo "Backup directory is required." >&2
	usage >&2
	exit 1
fi

if [[ "$TARGET" != "local" && "$TARGET" != "remote" ]]; then
	echo "--target must be local or remote." >&2
	exit 1
fi

if [[ "$TARGET" == "remote" && "$CONFIRM" != "I_UNDERSTAND_PRODUCTION" ]]; then
	echo "Remote restore blocked. Re-run with --confirm I_UNDERSTAND_PRODUCTION." >&2
	exit 1
fi

D1_FILE="$BACKUP_DIR/d1.sql"
MANIFEST="$BACKUP_DIR/r2-manifest.tsv"
if [[ ! -f "$D1_FILE" ]]; then
	echo "Missing ${D1_FILE}" >&2
	exit 1
fi

WRANGLER_FLAGS=()
if [[ "$TARGET" == "remote" ]]; then
	WRANGLER_FLAGS=(--remote)
fi

echo "Importing D1 (${DB_NAME}, target=${TARGET}) from ${D1_FILE}"
npx wrangler d1 execute "$DB_NAME" "${WRANGLER_FLAGS[@]}" --file="$D1_FILE"

if [[ -f "$MANIFEST" ]]; then
	echo "Restoring R2 objects listed in ${MANIFEST}"
	tail -n +2 "$MANIFEST" | while IFS=$'\t' read -r key _size _uploaded; do
		[[ -z "$key" ]] && continue
		local_path="$BACKUP_DIR/r2-objects/$key"
		if [[ ! -f "$local_path" ]]; then
			echo "skip missing object file: $key" >&2
			continue
		fi
		npx wrangler r2 object put "$R2_BUCKET/${key}" "${WRANGLER_FLAGS[@]}" --file="$local_path" >/dev/null
		echo "restored r2://$R2_BUCKET/$key"
	done
else
	echo "No r2-manifest.tsv found; skipped R2 restore."
fi

echo "Restore complete (${TARGET})."
