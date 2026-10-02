#!/usr/bin/env bash
set -euo pipefail

# Compatibility path. Shared macOS release helpers live in the release-mac-app skill.
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=/Users/steipete/Projects/agent-scripts/skills/release-mac-app/scripts/lib/mac_release.sh
source "$SCRIPT_DIR/../skills/release-mac-app/scripts/lib/mac_release.sh"
