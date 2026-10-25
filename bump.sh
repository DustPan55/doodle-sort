#!/usr/bin/env bash
# Set the app version in app.js and sw.js. The new service-worker cache makes installed phones update.
# Usage: ./bump.sh 1.3.0
set -euo pipefail
v="${1:?usage: ./bump.sh <version>}"
cd "$(dirname "$0")"
sed -i "s/^const APP_VERSION = '[^']*'/const APP_VERSION = '$v'/" app.js
sed -i "s/^const VERSION = '[^']*'/const VERSION = '$v'/" sw.js
grep -H "^const APP_VERSION\|^const VERSION" app.js sw.js
