#!/usr/bin/env bash
# The SwordCLI installer moved to https://swordcli.co/install.sh
# This shim keeps old `curl ... github.io ... | bash` one-liners working.
set -euo pipefail
exec bash -c "$(curl -fsSL https://swordcli.co/install.sh)"
