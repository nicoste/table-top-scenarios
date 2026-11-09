import { describe, it, expect } from 'vitest';
import { blockKey, DAYLIGHT, isKnownSwatch, propType } from '@tt/domain';
import {
  DIORAMA_TOTAL_STEPS,
  DIORAMA_STEP_TITLES,
  clearDiorama,
  dioramaAtStep,
  dioramaStart,
  nextDioramaCursor,
  showDiorama,
} from '@tt/client-core';
import type { DioramaCursor, DioramaStage } from '@tt/client-core';

describe('dioramaAtStep', () => {
  it('defines a title for every step from 1 to 10', () => {
    expect(DIORAMA_TOTAL_STEPS).toBe(10);
    expect(DIORAMA_STEP_TITLES).toHaveLength(DIORAMA_TOTAL_STEPS);
  });

  it('uses only valid domain swatches and prop types across all 10 steps', () => {
    const full = dioramaAtStep(DIORAMA_TOTAL_STEPS);
    expect(full.map.blocks.size).toBeGreaterThan(200);
    for (const swatch of full.map.blocks.values()) {
      expect(isKnownSwatch(swatch)).toBe(true);
    }
    expect(full.map.props.length).toBeGreaterThan(0);
    for (const prop of full.map.props) {
      expect(propType(prop.type)).not.toBeNull();
    }
    expect(full.tokens).toHaveLength(3);
  });

  it('grows the scene monotonically from step 1 to step 10 and undoes identically', () => {
    const scores: number[] = [];
    for (let step = 1; step <= DIORAMA_TOTAL_STEPS; step++) {
      const built = dioramaAtStep(step, 'build');
      const undone = dioramaAtStep(step, 'undo');
      expect(built.map.blocks).toEqual(undone.map.blocks);
      expect(built.map.props).toEqual(undone.map.props);
      expect(built.tokens).toEqual(undone.tokens);
      const score = built.map.blocks.size + built.map.props.length * 10 + built.tokens.length * 20;
      scores.push(score);
    }
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]!).toBeGreaterThan(scores[i - 1]!);
    }
  });

  it('stands every token and prop on a block, and none inside one, at every step', () => {
    for (let step = 1; step <= DIORAMA_TOTAL_STEPS; step++) {
      const { map, tokens } = dioramaAtStep(step);
      const placed = [
        ...tokens.map((token) => ({ what: token.memberId, at: token.at })),
        ...map.props.map((prop) => ({ what: prop.id, at: prop.at })),
      ];
      for (const { what, at } of placed) {
        expect(map.blocks.has(blockKey(at)), `${what} is inside a block at step ${step}`).toBe(false);
        expect(map.blocks.has(blockKey({ ...at, y: at.y - 1 })), `${what} stands on nothing at step ${step}`).toBe(true);
      }
    }
  });
});

describe('nextDioramaCursor', () => {
  it('steps 1..10 in build phase, holds at 10, undoes 10..1, holds at 1, and loops', () => {
    let cursor: DioramaCursor = { step: 1, phase: 'build', hold: 0 };
    const visited: string[] = [`${cursor.phase}:${cursor.step}`];

    for (let tick = 0; tick < 22; tick++) {
      cursor = nextDioramaCursor(cursor);
      visited.push(`${cursor.phase}:${cursor.step}`);
    }

    // Reaches build:10, holds once at build:10, then steps down undo:9 .. undo:1, holds at undo:1, then build:2
    expect(visited.slice(0, 11)).toEqual([
      'build:1',
      'build:2',
      'build:3',
      'build:4',
      'build:5',
      'build:6',
      'build:7',
      'build:8',
      'build:9',
      'build:10',
      'build:10',
    ]);
    expect(visited.slice(11, 22)).toEqual([
      'undo:9',
      'undo:8',
      'undo:7',
      'undo:6',
      'undo:5',
      'undo:4',
      'undo:3',
      'undo:2',
      'undo:1',
      'undo:1',
      'build:2',
    ]);
  });
});

describe('the diorama on the Stage', () => {
  /** A Stage that only writes down what it was asked. */
  function recording() {
    const calls: string[] = [];
    const stage: DioramaStage = {
      setMap: (map) => { calls.push(map ? 'map' : 'no map'); },
      setTokens: (tokens) => { calls.push(tokens ? 'tokens' : 'no tokens'); },
      setLighting: (lighting) => { calls.push(lighting === DAYLIGHT ? 'daylight' : 'lighting'); },
      setTarget: () => { calls.push('framed'); },
    };
    return { stage, calls };
  }

  it('hands the Stage the same scene for the same step, so a re-render rebuilds nothing', () => {
    // The Stage keeps a body it is handed again (R-19a); a new object, even
    // an equal one, is a full rebuild.
    expect(dioramaAtStep(4)).toBe(dioramaAtStep(4));
    expect(dioramaAtStep(4).map).toBe(dioramaAtStep(4).map);
    expect(dioramaAtStep(4, 'undo')).toBe(dioramaAtStep(4, 'undo'));
    expect(dioramaAtStep(5).map).not.toBe(dioramaAtStep(4).map);
  });

  it('frames the island only when asked', () => {
    const { stage, calls } = recording();
    showDiorama(stage, dioramaAtStep(1), true);
    showDiorama(stage, dioramaAtStep(2), false);
    expect(calls.filter((call) => call === 'framed')).toHaveLength(1);
    expect(calls.filter((call) => call === 'map')).toHaveLength(2);
  });

  it('leaves the Stage empty and in daylight for the campaign that follows', () => {
    const { stage, calls } = recording();
    clearDiorama(stage);
    expect(calls).toEqual(['no tokens', 'no map', 'daylight']);
  });

  it('holds the finished island still for anyone who asks for less motion', () => {
    expect(dioramaStart(true)).toEqual({ step: DIORAMA_TOTAL_STEPS, phase: 'build', hold: 0 });
    expect(dioramaStart(false)).toEqual({ step: 1, phase: 'build', hold: 0 });
  });
});
