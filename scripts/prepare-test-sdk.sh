#!/usr/bin/env bash
set -euo pipefail
mkdir -p .test-sdk
curl -fsSL https://registry.npmjs.org/@mega-yfue/eufy-sdk/-/eufy-sdk-0.3.0.tgz -o .test-sdk/sdk.tgz
echo '26e47102b23a965683622ca1fd08740b3a386c348490e2741debd3703ef55d72  .test-sdk/sdk.tgz' | sha256sum -c -
tar -xzf .test-sdk/sdk.tgz -C .test-sdk
