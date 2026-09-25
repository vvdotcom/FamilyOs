declare module 'react-native-pixel-perfect' {
  type DesignResolution = {
    width: number;
    height: number;
  };

  export function create(designResolution: DesignResolution): (pixels: number) => number;
}
