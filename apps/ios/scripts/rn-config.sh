#!/bin/sh
# Emits the React Native autolinking JSON for the mobile-chat workspace.
# Invoked by the Podfile's `use_native_modules!` hook.
set -e
DIR="$(cd "$(dirname "$0")/../../mobile-chat" && pwd)"
cd "$DIR"
exec node -e "process.argv=['','','config']; require('@react-native-community/cli').run()"
