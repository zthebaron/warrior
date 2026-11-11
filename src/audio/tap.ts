// The sound tap (D-022): what turns the player's motion into sound events.
//
// The player has no events to listen to, and gets none: nothing is added to src/entities/player.ts. After each
// fixed tick this reads four things the player already shows (its state, whether it is on the ground, its
// vertical speed, and how many torii the run has logged) and compares them with the tick before. It writes
// nothing back. Remove it and the simulation, the traces and the goldens are the same; it is not built at all
// on a page without sound.
//
// What it hears:
//   jump, wall jump      the state becomes `jump` or `wall_jump`
//   double jump          the state becomes `double_jump`: the jump's sound, played faster
//   dash                 the state becomes `dash`
//   wall grab            the state becomes `wall_slide` or `ledge_grab`
//   landing              the player is on the ground and was not, the tick before. How hard is the downward speed
//                        it had on the tick before (the tick of the landing has already zeroed it): the sound
//                        is louder the harder it is, and past `hardAbove` it is the heavy landing's sound.
//                        The end of a ledge climb also puts the player on the ground, with no fall: no sound.
//   torii                the run has logged one more checkpoint
//   slash                the player has started one more slash (D-023: the slash starts in the fixed tick now,
//                        so it is heard here like every other move, and no longer played where the key is read)
//   the fight (D-023)    what src/systems/fight.ts reported for the tick: a swordsman notices the warrior, the
//                        warrior's blade lands (and, on the hit that fells him, he falls), a swordsman's blade lands
//
// A teleport (a level starting, a respawn) drops the player from where it stands, which reads as a landing a
// tick or two later. reset() is called at each teleport and the first landing after it makes no sound.
//
// Every number is in MEASUREMENTS.md "D-022 sound".

import type { Player, PlayerState } from '../entities/player';
import type { GameAudio } from './audio';
import type { FightEvent } from '../systems/fight';

export const SOUND_TAP = {
  /** the second jump is the first jump's sound at this rate */
  doubleJumpRate: 1.3,
  /** arriving at the goal is the torii's bell, lower */
  goalRate: 0.75,
  land: {
    silentBelow: 3,   // m/s: stepping down a stair is not a landing
    hardAbove: 18,    // m/s: a jump on flat ground lands at 15.3; faster than this it has been a fall
    fullAt: 30,       // m/s: as loud as a landing gets (terminal speed is 35)
    quietest: 0.3,    // the level of a landing just over silentBelow
  },
};

const T = SOUND_TAP;

export class SoundTap {
  private state: PlayerState | null = null;
  private grounded = false;
  private fallSpeed = 0;
  private checkpoints = 0;
  private skipLanding = true;
  /** how many slashes the player had started at the last tick; -1 before the first tick */
  private slashes = -1;

  constructor(private readonly audio: GameAudio) {}

  /** The player was put somewhere (level start, respawn): forget the last tick, and let it land in silence. */
  reset(checkpoints = 0): void {
    this.state = null;
    this.grounded = false;
    this.fallSpeed = 0;
    this.checkpoints = checkpoints;
    this.skipLanding = true;
  }

  /** Call once after each fixed tick that advanced the player. Reads only. */
  afterTick(player: Player, checkpoints: number, fight: readonly FightEvent[] = []): void {
    if (this.slashes >= 0 && player.slashCount > this.slashes) this.audio.play('slash');
    this.slashes = player.slashCount;
    for (const e of fight) {
      if (e.kind === 'notice') this.audio.play('notice');
      else if (e.kind === 'hit') this.audio.play('hit');
      else if (e.kind === 'fell') { this.audio.play('hit'); this.audio.play('fell'); }
      else if (e.kind === 'cut') this.audio.play('cut');
    }
    const s = player.state;
    const was = this.state;
    if (was !== null && s !== was) {
      if (s === 'jump' || s === 'wall_jump') this.audio.play('jump');
      else if (s === 'double_jump') this.audio.play('jump', 1, T.doubleJumpRate);
      else if (s === 'dash') this.audio.play('dash');
      else if ((s === 'wall_slide' || s === 'ledge_grab') && was !== 'wall_slide' && was !== 'ledge_grab') this.audio.play('wall_grab');
    }
    if (player.grounded && !this.grounded) {
      if (this.skipLanding) this.skipLanding = false;
      else if (was !== 'ledge_climb' && this.fallSpeed >= T.land.silentBelow) {
        const k = Math.min(1, (this.fallSpeed - T.land.silentBelow) / (T.land.fullAt - T.land.silentBelow));
        this.audio.play(this.fallSpeed >= T.land.hardAbove ? 'land_hard' : 'land_soft', T.land.quietest + (1 - T.land.quietest) * k);
      }
    }
    if (checkpoints > this.checkpoints) this.audio.play('checkpoint');
    this.checkpoints = checkpoints;
    this.state = s;
    this.grounded = player.grounded;
    this.fallSpeed = Math.max(0, -player.vel.y);
  }

  /** The chapter's last torii was reached. */
  goal(): void {
    this.audio.play('checkpoint', 1, T.goalRate);
  }

  respawned(checkpoints: number): void {
    this.reset(checkpoints);
    this.audio.play('respawn');
  }
}
