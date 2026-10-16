/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
// Vega's Metro preset does not inline EXPO_PUBLIC_* variables the way Expo does, so without this
// process.env.EXPO_PUBLIC_FAMILYOS_API_URL is undefined at runtime and every build talks to
// http://127.0.0.1:8787. Set it at build time: EXPO_PUBLIC_FAMILYOS_API_URL=https://... yarn build:vega
// (run with --reset-cache or clear Metro's cache after changing the value).
// EXPO_PUBLIC_FAMILYOS_WALL_IDLE_SECONDS: seconds before the wall calendar (default 300; 30 for filming).
// EXPO_PUBLIC_FAMILYOS_WALL_VIDEO: 0 shows the wall's still posters instead of the weather loops.
const INLINE_ENV = ['EXPO_PUBLIC_FAMILYOS_API_URL', 'EXPO_PUBLIC_FAMILYOS_WALL_IDLE_SECONDS', 'EXPO_PUBLIC_FAMILYOS_WALL_VIDEO'];
function inlinePublicEnv({ types: t }) {
  return {
    visitor: {
      MemberExpression(path) {
        for (const name of INLINE_ENV) {
          if (path.matchesPattern(`process.env.${name}`)) {
            const value = process.env[name];
            path.replaceWith(value === undefined ? t.identifier('undefined') : t.stringLiteral(value));
            return;
          }
        }
      },
    },
  };
}

module.exports = {
  presets: ['module:metro-react-native-babel-preset'],
  plugins: [
    inlinePublicEnv,
    // Reanimated plugin must be listed last
    '@amazon-devices/react-native-reanimated/plugin',
  ],
};
