#!/bin/sh
# What a release would ship, as facts a person can check: nothing here is a judgement.
#   scripts/release-facts.sh [base] [head]     default: origin/production origin/main
# Read-only. Prints the commit range, the changes under the paths a release must be read
# for, every statement in a new migration that drops or rewrites, new dependencies, and what
# was seen working (the "Seen" lines of the commits that finished an item).
set -eu
base=${1:-origin/production}
head=${2:-origin/main}
range="$base..$head"
git rev-parse -q --verify "$base^{commit}" >/dev/null || { echo "no such base: $base" >&2; exit 64; }

echo "## Range"
echo "$base ($(git rev-parse --short "$base")) -> $head ($(git rev-parse --short "$head")): $(git rev-list --count "$range") commits"
# A signature's presence, read from the commit itself: verifying it needs the owner's
# allowed-signers file, which only the Mac has (GitHub shows "Verified" for the same thing).
unsigned=0
for c in $(git rev-list "$range"); do
  git cat-file commit "$c" | sed '/^$/q' | grep -q '^gpgsig' || unsigned=$((unsigned + 1))
done
echo "commits that carry no signature: $unsigned"

echo
echo "## Files changed, by area"
git diff --name-only "$range" | awk -F/ '{ k = ($1=="apps"||$1=="packages") ? $1"/"$2 : $1; n[k]++ } END { for (k in n) printf "%5d  %s\n", n[k], k }' | sort -k2

echo
echo "## Paths a release is read for"
# Quoted, so the shell leaves the globs to git, whose `*` also crosses folders.
for p in .github packages/db/migrations apps/mobile/eas.json apps/mobile/app.json apps/web/vercel.json \
  apps/web/next.config.ts .claude .githooks scripts .env.example pnpm-workspace.yaml docker-compose.yml \
  package.json eslint.config.mjs '*tsconfig*.json' '*vitest.config.ts' packages/api/test/contract; do
  n=$(git diff --name-only "$range" -- "$p" | wc -l | tr -d ' ')
  [ "$n" = 0 ] || { echo "$p: $n file(s)"; git diff --stat=100 "$range" -- "$p" | sed '$d' | sed 's/^/   /'; }
done

echo
echo "## Migration statements that drop or rewrite"
found=0
for f in $(git diff --name-only --diff-filter=AMR "$range" -- 'packages/db/migrations/*.sql'); do
  hits=$(git show "$head:$f" | grep -n -i -E '^\s*(drop|truncate|delete|update)\b|\balter\s+table\b.*\b(drop|rename|alter\s+column.*\btype)\b|\bdisable\s+trigger\b' || true)
  [ -z "$hits" ] || { found=1; echo "$f"; echo "$hits" | cut -c1-160 | sed 's/^/   /'; }
done
[ "$found" = 1 ] || echo "none"

echo
echo "## Dependencies added or moved"
git diff "$range" -- package.json 'apps/*/package.json' 'packages/*/package.json' | grep -E '^[+-]\s+"[^"]+": "[~^]?[0-9]' | sed 's/^/   /' || echo "   none"

echo
echo "## Seen working"
seen=0
for c in $(git rev-list --reverse "$range"); do
  lines=$(git log -1 --format=%B "$c" | grep '^Seen' || true)
  [ -z "$lines" ] || { seen=1; git log -1 --format='%h %s' "$c"; echo "$lines" | sed 's/^/   /'; }
done
[ "$seen" = 1 ] || echo "none"
