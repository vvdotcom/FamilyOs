import React from 'react';
import { FamilyOsShell } from '@familyos/shared-ui';

/** Vega uses the same shell and deterministic household as the local Expo TV target. */
export default function VegaDrawerNavigator() {
  return <FamilyOsShell />;
}
