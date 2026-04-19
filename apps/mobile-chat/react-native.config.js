// RN CLI config: the iOS shell lives in a sibling workspace (apps/ios), not
// inside this JS module. Autolinking and the Pods integration need to know that.
module.exports = {
  project: {
    ios: {
      sourceDir: "../ios",
    },
  },
};
