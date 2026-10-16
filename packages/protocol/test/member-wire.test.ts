// A member's picture on the wire and on disk (R-204).

import { describe, it, expect } from 'vitest';
import { MemberWireSchema, IntentSchema } from '@tt/protocol';
import { isImageId, imageExtension, imageType } from '@tt/domain';

const PICTURE = `${'c'.repeat(64)}.webp`;
const member = { id: 'member_a', name: 'Aldra', colour: '#57d9a3', visionRange: 12 };

describe("a picture's name", () => {
  it('is 64 hex digits and a kind', () => {
    expect(isImageId(PICTURE)).toBe(true);
    expect(isImageId(`${'c'.repeat(64)}.png`)).toBe(true);
    expect(isImageId(`${'C'.repeat(64)}.webp`)).toBe(false);
    expect(isImageId(`${'c'.repeat(63)}.webp`)).toBe(false);
    expect(isImageId(`${'c'.repeat(64)}.svg`)).toBe(false);
    expect(isImageId(`../${'c'.repeat(64)}.webp`)).toBe(false);
    expect(isImageId(null)).toBe(false);
  });

  it('knows the kinds it takes, and which type each is served as', () => {
    expect(imageExtension('image/webp')).toBe('webp');
    expect(imageExtension('image/PNG; charset=binary')).toBe('png');
    expect(imageExtension('image/svg+xml')).toBeNull();
    expect(imageType(PICTURE as never)).toBe('image/webp');
  });
});

describe('a member on the wire', () => {
  it('reads a member from before pictures as having none', () => {
    expect(MemberWireSchema.parse(member).image).toBeNull();
  });

  it('carries a picture through', () => {
    expect(MemberWireSchema.parse({ ...member, image: PICTURE }).image).toBe(PICTURE);
  });

  it('reads anything that is not a picture as none, rather than refusing the campaign', () => {
    for (const image of ['../../etc/passwd', 42, { evil: true }, '']) {
      expect(MemberWireSchema.parse({ ...member, image }).image).toBeNull();
    }
  });

  it('is strict at the edge: an edit naming something that is not a picture is refused', () => {
    expect(IntentSchema.safeParse({ kind: 'editMember', id: 'member_a', image: 'cat.png' }).success)
      .toBe(false);
    expect(IntentSchema.safeParse({ kind: 'editMember', id: 'member_a', image: PICTURE }).success)
      .toBe(true);
    // `null` takes a picture off.
    expect(IntentSchema.safeParse({ kind: 'editMember', id: 'member_a', image: null }).success)
      .toBe(true);
  });
});
