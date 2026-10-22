const ExpoEnvironment = require('jest-expo/src/preset/nativeEnvironment');
const CanvasKitInit = require('canvaskit-wasm/bin/full/canvaskit');

// Keep Expo/RN's environment while using Skia's official CPU CanvasKit mock.
module.exports = class PixoraTestEnvironment extends ExpoEnvironment {
  async setup() {
    await super.setup();
    this.global.CanvasKit = await CanvasKitInit({});
  }
};
