import React, { useMemo } from 'react';
import { View } from 'react-native';
import { encodeQR } from '../utils/qrcode';

/**
 * A scannable QR code drawn with plain Views (no SVG or native module), so it renders the same on Vega OS,
 * Fire OS and the web. Dark runs in each row are merged into one View to keep the view count small.
 */
export function QRCode({ value, size = 280, quietZone = 4, accessibilityLabel }: {
  value: string;
  size?: number;
  quietZone?: number;
  accessibilityLabel?: string;
}) {
  const matrix = useMemo(() => encodeQR(value), [value]);
  const modules = matrix.length + quietZone * 2;
  const cell = Math.max(2, Math.floor(size / modules));
  const side = cell * modules;
  const runs = useMemo(() => {
    const result: { x: number; y: number; length: number }[] = [];
    matrix.forEach((row, y) => {
      let start = -1;
      row.forEach((dark, x) => {
        if (dark && start < 0) start = x;
        if ((!dark || x === row.length - 1) && start >= 0) {
          const end = dark ? x + 1 : x;
          result.push({ x: start, y, length: end - start });
          start = -1;
        }
      });
    });
    return result;
  }, [matrix]);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? 'QR code'}
      style={{ width: side, height: side, backgroundColor: '#FFFFFF', borderRadius: cell * 2 }}>
      {runs.map((run) => (
        <View
          key={`${run.y}-${run.x}`}
          style={{
            position: 'absolute',
            left: (run.x + quietZone) * cell,
            top: (run.y + quietZone) * cell,
            width: run.length * cell,
            height: cell,
            backgroundColor: '#111111',
          }}
        />
      ))}
    </View>
  );
}
