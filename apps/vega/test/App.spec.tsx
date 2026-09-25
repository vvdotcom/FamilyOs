/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */

import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('../../../packages/shared-ui/src/app/configureRemoteControl', () => ({}));
jest.mock('../src/navigation/VegaAppNavigator', () => {
  const ReactModule = require('react');
  const ReactNative = require('react-native');
  return function MockVegaAppNavigator() {
    return ReactModule.createElement(
      ReactNative.View,
      { testID: 'familyos-root' },
      ReactModule.createElement(ReactNative.Text, null, 'FamilyOS'),
    );
  };
});

import {App} from '../src/App';

describe('FamilyOS Vega shell', () => {
  it('mounts the FamilyOS root', () => {
    const screen = render(<App />);
    expect(screen.getByTestId('familyos-root')).toBeTruthy();
    expect(screen.getByText('FamilyOS')).toBeTruthy();
  });
});
