#!/bin/sh
# Cross-repository regression. Pass a locally built Linux CLI for the Docker
# engine's architecture and a task-owned artifact directory. No live API needed.
set -eu
if [ "$#" -ne 2 ]; then
  echo "Usage: $0 /absolute/path/to/linux/fibe /absolute/artifact/directory" >&2
  exit 2
fi
cli_binary=$1
output_dir=$2
test -x "$cli_binary"
mkdir -p "$output_dir"
output_dir=$(cd "$output_dir" && pwd)
repo_dir=$(cd "$(dirname "$0")/../.." && pwd)
cp "$cli_binary" "$output_dir/fibe"
cd "$repo_dir"
bun build scripts/ci/playground-link-path.fixture.ts --target=node --format=cjs --outfile="$output_dir/fixture.cjs"
docker run --rm --network none --read-only \
  --tmpfs /app:rw,mode=755 --tmpfs /host:rw,mode=755 --tmpfs /tmp:rw,mode=1777 \
  --mount "type=bind,source=$output_dir,target=/contract,readonly" \
  --env NODE_ENV=production --env PATH=/contract:/usr/local/bin:/usr/bin:/bin \
  --workdir /app node:24 node /contract/fixture.cjs
