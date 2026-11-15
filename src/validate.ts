/**
 * Instrument validation for the BLIP-01 PSG.
 *
 * `validateInstrument` is called by the engine (and the editors) with a parsed
 * `InstrumentNode`. Return an empty array when the instrument is valid, or a
 * list of `{ field, message }` errors describing every problem.
 */
import type { InstrumentNode, ValidationError } from '@beatbax/engine';
import { parseWaveTable } from './periodTables.js';

/** Instrument `type` values accepted by this chip (also exported for tooling). */
export const BLIP_TYPES = ['pulse', 'triangle', 'wave', 'noise'] as const;
export type BlipType = (typeof BLIP_TYPES)[number];

/** Accepted `duty` strings (mirrors `DUTY_FRACTIONS` in periodTables.ts). */
const VALID_DUTY = new Set(['12.5', '25', '50', '75', '12', '0.125', '0.25', '0.5', '0.75']);

export function validateBlipInstrument(inst: InstrumentNode): ValidationError[] {
  const errors: ValidationError[] = [];
  const type = (inst.type ?? '').toLowerCase();

  // 1. `type` is required and must be one of the known voices.
  if (!type) {
    errors.push({
      field: 'type',
      message: `missing instrument type — expected one of: ${BLIP_TYPES.join(', ')}`,
    });
    return errors;
  }
  if (!(BLIP_TYPES as readonly string[]).includes(type)) {
    errors.push({
      field: 'type',
      message: `unknown blip instrument type '${inst.type}' (expected: ${BLIP_TYPES.join(', ')})`,
    });
    return errors; // no point validating fields for an unknown type
  }

  // 2. `vol` — integer 0..15 (0 = silent, 15 = loudest).
  if (inst.vol !== undefined) {
    const v = Number(inst.vol);
    if (!Number.isFinite(v) || v < 0 || v > 15 || v !== Math.floor(v)) {
      errors.push({
        field: 'vol',
        message: `vol must be an integer 0–15 (got '${inst.vol}')`,
      });
    }
  }

  // 3. `duty` — pulse channel only.
  if (type === 'pulse') {
    if (inst.duty !== undefined && !VALID_DUTY.has(String(inst.duty).trim().toLowerCase())) {
      errors.push({
        field: 'duty',
        message: `duty must be one of 12.5, 25, 50, 75 (got '${inst.duty}')`,
      });
    }
  } else if (inst.duty !== undefined) {
    errors.push({ field: 'duty', message: 'duty is only valid on the pulse channel' });
  }

  // 4. `env` — hardware envelope. Accepts either a CSV string
  //    "<initial>,<up|down|flat>[,<period>]" or a normalized object
  //    { level, direction, period } (JSON `env={…}` / parser-normalized).
  const env = inst.env;
  if (env !== undefined && env !== null) {
    if (typeof env === 'object') {
      const level = Number((env as any).level ?? (env as any).initial);
      if (!Number.isFinite(level) || level < 0 || level > 15) {
        errors.push({ field: 'env', message: `env level must be 0–15 (got '${level}')` });
      }
      const dir = String((env as any).direction ?? 'none').toLowerCase();
      if (!['up', 'down', 'none', 'flat'].includes(dir)) {
        errors.push({ field: 'env', message: `env direction must be up, down, none, or flat (got '${dir}')` });
      }
      const period = Number((env as any).period ?? 0);
      if (!Number.isFinite(period) || period < 0 || period > 15) {
        errors.push({ field: 'env', message: `env period must be 0–15 (got '${period}')` });
      }
    } else if (String(env).trim() !== '') {
      const parts = String(env).split(',').map((s) => s.trim());
      const initial = parseInt(parts[0], 10);
      if (Number.isNaN(initial) || initial < 0 || initial > 15) {
        errors.push({
          field: 'env',
          message: `env initial volume must be 0–15 (got '${parts[0] ?? ''}')`,
        });
      }
      if (parts[1] && !['up', 'down', 'flat'].includes(parts[1].toLowerCase())) {
        errors.push({
          field: 'env',
          message: `env direction must be up, down, or flat (got '${parts[1]}')`,
        });
      }
      if (parts[2]) {
        const period = parseInt(parts[2], 10);
        if (Number.isNaN(period) || period < 0 || period > 15) {
          errors.push({
            field: 'env',
            message: `env period must be 0–15 (got '${parts[2]}')`,
          });
        }
      }
    }
  }

  // 5. `wave` — wavetable, wave channel only.
  if (type === 'wave') {
    const table = parseWaveTable(inst.wave);
    if (!table) {
      errors.push({
        field: 'wave',
        message: `wave must be a 16 or 32 sample array (0–15) or a 32-nibble hex string (got '${inst.wave ?? ''}')`,
      });
    } else if (table.length !== 16 && table.length !== 32) {
      errors.push({
        field: 'wave',
        message: `wave must have 16 or 32 samples, got ${table.length}`,
      });
    }
  } else if (inst.wave !== undefined) {
    errors.push({ field: 'wave', message: 'wave is only valid on the wave channel' });
  }

  // 6. `noise_mode` — noise channel only.
  if (type === 'noise') {
    const mode = String(inst.noise_mode ?? 'white').toLowerCase();
    if (!['white', 'periodic'].includes(mode)) {
      errors.push({
        field: 'noise_mode',
        message: `noise_mode must be 'white' or 'periodic' (got '${inst.noise_mode}')`,
      });
    }
  }

  // 7. `noise_rate` — noise channel only: 0 (hat) / 1 (snare) / 2 (kick).
  if (type === 'noise') {
    if (inst.noise_rate !== undefined) {
      const rate = Number(inst.noise_rate);
      if (!Number.isFinite(rate) || rate < 0 || rate > 2 || rate !== Math.floor(rate)) {
        errors.push({
          field: 'noise_rate',
          message: `noise_rate must be 0, 1, or 2 (got '${inst.noise_rate}')`,
        });
      }
    }
  } else if (inst.noise_rate !== undefined) {
    errors.push({ field: 'noise_rate', message: 'noise_rate is only valid on the noise channel' });
  }

  return errors;
}
