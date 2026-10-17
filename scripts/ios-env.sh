#!/usr/bin/env bash
# Source from the project root; all overrides are process-local.
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
# Hosted Xcode may prefer Metal, which has no Swift compatibility libraries.
export TOOLCHAINS=com.apple.dt.toolchain.XcodeDefault
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
[[ "$(node -p 'process.versions.node.split(".")[0]')" == 22 ]] || { echo 'Node 22 required' >&2; exit 1; }
if [[ -x "$PWD/.p-build-app/local/ruby-3.3.12/bin/ruby" ]]; then
 export PATH="$PWD/.p-build-app/local/ruby-3.3.12/bin:$PATH"
fi
if ! ruby -rpsych -ropenssl -e 'abort unless RUBY_VERSION == "3.3.12"' >/dev/null 2>&1; then
 python3 scripts/setup-ios-ruby.py
 export PATH="$PWD/.p-build-app/local/ruby-3.3.12/bin:$PATH"
fi
export GEM_HOME="$PWD/.p-build-app/local/gems-ruby-3.3.12"
export GEM_PATH="$GEM_HOME:$(ruby -e 'print Gem.default_dir')"
export BUNDLE_PATH="$PWD/vendor/bundle"
if [[ ! -f "$GEM_HOME/bin/bundle" ]]; then
 gem install bundler -v 4.0.23 --install-dir "$GEM_HOME" --no-document
fi
IOS_BUNDLE_COMMAND=(ruby "$GEM_HOME/bin/bundle" _4.0.23_)
if [[ -L node_modules && -z "${PIXORA_METRO_CONFIG:-}" ]]; then
 mkdir -p .p-build-app/local
 cat > .p-build-app/local/metro-ios.config.cjs <<'METRO'
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const modules = fs.realpathSync(path.join(root, 'node_modules'));
const config = require(path.join(root, 'metro.config.js'));
module.exports = {
  ...config,
  projectRoot: root,
  watchFolders: [...(config.watchFolders || []), modules],
  resolver: {
    ...config.resolver,
    nodeModulesPaths: [modules, ...(config.resolver?.nodeModulesPaths || [])],
  },
};
METRO
 export PIXORA_METRO_CONFIG="$PWD/.p-build-app/local/metro-ios.config.cjs"
fi
