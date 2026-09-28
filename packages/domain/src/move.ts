/**
 * Original, bundled movement-break routines. General activity only, not medical or fitness advice.
 * Keep in sync with services/family-agent/app/move.py (a backend test compares IDs and stars).
 */
export interface MoveStep {
  name: string;
  seconds: number;
  instruction: string;
}

export interface MoveRoutine {
  id: string;
  name: string;
  stars: number;
  restSeconds: number;
  moves: MoveStep[];
}

export const MOVE_SAFETY_NOTE =
  "Move at your own pace, give everyone space, and skip anything that doesn't feel right. " +
  'This is general activity, not medical or fitness advice.';

export const MOVE_ROUTINES: MoveRoutine[] = [
  {
    id: 'wiggle-warmup',
    name: 'Wiggle warm-up',
    stars: 2,
    restSeconds: 10,
    moves: [
      { name: 'Reach for the sky', seconds: 30, instruction: 'Stretch both arms up tall, then float them down.' },
      { name: 'Shake it out', seconds: 30, instruction: 'Wiggle your hands, arms, and shoulders loose.' },
      { name: 'March in place', seconds: 40, instruction: 'Lift your knees and swing your arms.' },
      { name: 'Side reaches', seconds: 30, instruction: 'Reach one arm over your head to the side, then switch.' },
    ],
  },
  {
    id: 'jungle-journey',
    name: 'Jungle journey',
    stars: 3,
    restSeconds: 12,
    moves: [
      { name: 'Tiptoe past the tiger', seconds: 30, instruction: 'Walk in place quietly on your tiptoes.' },
      { name: 'Frog hops', seconds: 30, instruction: 'Crouch low and do small hops in place.' },
      { name: 'Tall tree balance', seconds: 30, instruction: 'Stand on one foot and sway like a tree. Switch halfway.' },
      { name: 'Swing through the vines', seconds: 40, instruction: "Reach and pull like you're climbing, arm over arm." },
      { name: 'Sleepy sloth stretch', seconds: 30, instruction: 'Slowly roll down toward your toes, then roll back up.' },
    ],
  },
  {
    id: 'dance-party',
    name: 'Living room dance party',
    stars: 3,
    restSeconds: 10,
    moves: [
      { name: 'Freestyle', seconds: 45, instruction: 'Dance any way you like.' },
      { name: 'Freeze pose', seconds: 20, instruction: 'Strike a pose and hold it still.' },
      { name: 'Copy the leader', seconds: 45, instruction: 'Take turns leading a move for everyone to copy.' },
      { name: 'Cool-down sway', seconds: 30, instruction: 'Sway side to side and take slow breaths.' },
    ],
  },
];

/** One timeline entry per move and rest, so the TV can drive a countdown from a single index. */
export type MoveSegment = { kind: 'move' | 'rest'; seconds: number; move: MoveStep; next?: MoveStep };

export function moveSegments(routine: MoveRoutine): MoveSegment[] {
  return routine.moves.flatMap((move, index) => {
    const next = routine.moves[index + 1];
    const current: MoveSegment = { kind: 'move', seconds: move.seconds, move, next };
    return next ? [current, { kind: 'rest', seconds: routine.restSeconds, move: next, next }] : [current];
  });
}

/** Majority wins; ties go to this week's picker. Mirrors the server rule for display. */
export function familyNightTally(poll: { suggestions: Array<{ id: string }>; votes: Record<string, string> }) {
  const counts: Record<string, number> = Object.fromEntries(poll.suggestions.map((item) => [item.id, 0]));
  Object.values(poll.votes).forEach((id) => {
    if (id in counts) counts[id] += 1;
  });
  return counts;
}
