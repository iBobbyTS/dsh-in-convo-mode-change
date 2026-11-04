#!/usr/bin/env bash
# Unit tests have no dependency on a locally installed Harness.
set -euo pipefail
cd "$(dirname "$0")/.."
node --test test/host.test.mjs test/client.test.mjs
if node --input-type=module -e "import('@deepseek-ai/dsh-client-ui-slots')" >/dev/null 2>&1; then
  node test/slots.test.mjs
else
  echo 'SKIP: real SlotCore test (@deepseek-ai/dsh-client-ui-slots not installed)'
fi
