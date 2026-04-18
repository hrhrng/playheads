const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");
const path = require("path");

// pnpm hoists deps into a .pnpm store; Metro needs to walk up and find them.
// Point `watchFolders` at the repo root so symlinked packages resolve.
const repoRoot = path.resolve(__dirname, "../..");

/** @type {import('@react-native/metro-config').MetroConfig} */
const config = {
  projectRoot: __dirname,
  watchFolders: [repoRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(__dirname, "node_modules"),
      path.resolve(repoRoot, "node_modules"),
    ],
    // React Native expects a single react copy — enforce via workspace hoist.
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
