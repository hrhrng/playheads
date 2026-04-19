const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");
const path = require("path");

// pnpm hoists deps into a .pnpm store; Metro needs to walk up and find them.
// Point `watchFolders` at the repo root so symlinked packages resolve.
const repoRoot = path.resolve(__dirname, "../..");

// Single-copy enforcement. pnpm gives every package its own `node_modules/react`
// symlink; Metro's default resolver happily picks whichever one walks up first,
// which leads to two React copies loaded at runtime (hooks dispatcher = null).
// Force every bare `react` / `react-native` / `react/jsx-runtime` import to the
// root copy regardless of the requesting package's location.
const FORCED_SINGLETONS = new Set(["react", "react-native"]);

function forceSingleton(request) {
  if (FORCED_SINGLETONS.has(request)) {
    return path.resolve(repoRoot, "node_modules", request);
  }
  // Deep imports: react/jsx-runtime, react/jsx-dev-runtime, react-native/Libraries/...
  for (const pkg of FORCED_SINGLETONS) {
    if (request.startsWith(`${pkg}/`)) {
      return path.resolve(repoRoot, "node_modules", request);
    }
  }
  return null;
}

/** @type {import('@react-native/metro-config').MetroConfig} */
const config = {
  projectRoot: __dirname,
  watchFolders: [repoRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(__dirname, "node_modules"),
      path.resolve(repoRoot, "node_modules"),
    ],
    resolveRequest: (context, moduleName, platform) => {
      const forced = forceSingleton(moduleName);
      if (forced) {
        return {
          type: "sourceFile",
          filePath: require.resolve(forced),
        };
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
