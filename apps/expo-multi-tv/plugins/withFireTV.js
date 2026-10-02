/**
 * Fire OS (Android-based Fire TV) requirements for the Amazon Appstore:
 *  - a TV app must not require a touchscreen, or the store hides it from Fire TV devices;
 *  - leanback (Android TV launcher) support is declared but not required, so Fire TV models that do
 *    not report it can still install the app.
 * @react-native-tvos/config-tv adds the banner and the leanback launcher intent; this plugin makes the
 * two <uses-feature> entries explicit so a later plugin cannot flip them to required.
 */
const { withAndroidManifest } = require('expo/config-plugins');

const FEATURES = ['android.hardware.touchscreen', 'android.software.leanback'];

module.exports = function withFireTV(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest['uses-feature'] = manifest['uses-feature'] || [];
    for (const name of FEATURES) {
      const existing = manifest['uses-feature'].find((item) => item.$['android:name'] === name);
      if (existing) existing.$['android:required'] = 'false';
      else manifest['uses-feature'].push({ $: { 'android:name': name, 'android:required': 'false' } });
    }
    return mod;
  });
};
