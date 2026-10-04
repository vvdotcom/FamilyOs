import React from 'react';
import {render} from '@testing-library/react-native';
import {encodeQR} from '../../../packages/shared-ui/src/utils/qrcode';
import {QRCode} from '../../../packages/shared-ui/src/components/QRCode';

const PAIR_URL = 'https://hometide.up.railway.app/app/#pair=123456';

function finderAt(matrix: boolean[][], x: number, y: number) {
  // 7x7 finder: dark ring, light ring, dark 3x3 centre.
  for (let dy = 0; dy < 7; dy++)
    for (let dx = 0; dx < 7; dx++) {
      const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
      expect(matrix[y + dy][x + dx]).toBe(ring !== 2);
    }
}

describe('QR code for TV pairing', () => {
  it('picks the smallest version that fits and draws the three finder patterns', () => {
    const matrix = encodeQR(PAIR_URL);
    expect(matrix).toHaveLength(33); // Version 4 at error correction level M.
    matrix.forEach(row => expect(row).toHaveLength(33));
    finderAt(matrix, 0, 0);
    finderAt(matrix, 26, 0);
    finderAt(matrix, 0, 26);
    expect(matrix[33 - 8][8]).toBe(true); // The always-dark module.
  });

  it('timing patterns alternate and the code changes with the content', () => {
    const matrix = encodeQR(PAIR_URL);
    for (let i = 8; i < 25; i++) {
      expect(matrix[6][i]).toBe(i % 2 === 0);
      expect(matrix[i][6]).toBe(i % 2 === 0);
    }
    expect(encodeQR(PAIR_URL.replace('123456', '654321'))).not.toEqual(matrix);
    expect(encodeQR('hi')).toHaveLength(21);
    expect(() => encodeQR('x'.repeat(400))).toThrow(/too long/);
  });

  it('renders as plain Views with an accessible label', () => {
    const screen = render(<QRCode value={PAIR_URL} size={240} accessibilityLabel="Scan to connect this TV" />);
    expect(screen.getByLabelText('Scan to connect this TV')).toBeTruthy();
  });
});
