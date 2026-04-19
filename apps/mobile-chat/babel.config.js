module.exports = {
  presets: ["module:@react-native/babel-preset"],
  // Some transitive deps (zod, cloudflare/ai-chat) ship `export * as`
  // namespace re-exports that Metro's default preset doesn't rewrite.
  plugins: ["@babel/plugin-transform-export-namespace-from"],
};
