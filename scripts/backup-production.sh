#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DB_NAME="${CE_D1_DATABASE:-conference-engine}"
R2_BUCKET="${CE_R2_BUCKET:-conference-engine-assets}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${1:-$ROOT/backups/$TIMESTAMP}"

usage() {
	cat <<EOF
Usage: $(basename "$0") [output-directory]

Exports the remote D1 database and an R2 object inventory for ${R2_BUCKET}.
Requires an authenticated Wrangler session with access to the production bindings.

Environment overrides:
  CE_D1_DATABASE   D1 database name (default: ${DB_NAME})
  CE_R2_BUCKET     R2 bucket name (default: ${R2_BUCKET})
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
	usage
	exit 0
fi

mkdir -p "$OUT_DIR"

echo "Backing up D1 (${DB_NAME}) to ${OUT_DIR}/d1.sql"
npx wrangler d1 export "$DB_NAME" --remote --output="$OUT_DIR/d1.sql"

echo "Listing R2 objects (${R2_BUCKET}) into ${OUT_DIR}/r2-manifest.tsv"
{
	printf 'key\tsize\tuploaded\n'
	npx wrangler r2 object list "$R2_BUCKET" --remote --json \
		| node -e '
const fs = require("node:fs");
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
	const payload = JSON.parse(input || "{}");
	const objects = Array.isArray(payload.objects) ? payload.objects : [];
	for (const object of objects) {
		process.stdout.write(`${object.key}\t${object.size ?? ""}\t${object.uploaded ?? ""}\n`);
	}
});
'
} >"$OUT_DIR/r2-manifest.tsv"

cat >"$OUT_DIR/README.txt" <<EOF
conference-engine backup
created_utc: ${TIMESTAMP}
d1_database: ${DB_NAME}
r2_bucket: ${R2_BUCKET}

Restore with:
  scripts/restore-production.sh ${OUT_DIR} --target local
  scripts/restore-production.sh ${OUT_DIR} --target remote --confirm I_UNDERSTAND_PRODUCTION
EOF

echo "Backup complete: ${OUT_DIR}"
