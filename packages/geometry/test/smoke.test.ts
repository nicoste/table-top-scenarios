import { describe, it, expect } from 'vitest';
import { PACKAGE_NAME } from '@tt/geometry';

describe('@tt/geometry', () => {
  it('is wired into the test harness', () => {
    expect(PACKAGE_NAME).toBe('@tt/geometry');
  });
});
