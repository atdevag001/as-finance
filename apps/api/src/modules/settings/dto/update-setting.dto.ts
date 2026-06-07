import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * Keys that — if used inside a JSON setting value — would mutate the
 * prototype chain when the value is later assigned via bracket access in
 * Node's V8 runtime. Settings are persisted as JSONB and re-hydrated into
 * arbitrary places, so we reject these keys at the controller boundary.
 */
const POLLUTION_KEYS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

/**
 * Recursively walk `input` and return true if any key in any nested object
 * (or any key reachable through arrays) matches a prototype-pollution key.
 *
 * Uses a WeakSet to avoid infinite loops on cyclic structures. Primitive
 * values (including null) short-circuit to false.
 *
 * M11 — defence-in-depth: even after the rest of the platform stops doing
 * deep-merge into raw objects, callers must not be able to smuggle
 * `__proto__` / `constructor` / `prototype` into a setting value.
 */
export function hasPrototypePollutionKey(input: unknown): boolean {
  const seen = new WeakSet();

  const walk = (node: unknown): boolean => {
    if (node === null || typeof node !== 'object') {
      return false;
    }
    const obj = node;
    if (seen.has(obj)) {
      return false;
    }
    seen.add(obj);

    if (Array.isArray(node)) {
      for (const item of node) {
        if (walk(item)) return true;
      }
      return false;
    }

    // Use Reflect.ownKeys so symbol keys and non-enumerable own keys (which
    // JSON.parse cannot produce, but a hand-built object could) are still
    // covered if this helper is ever reused on a non-JSON payload.
    for (const key of Reflect.ownKeys(obj)) {
      if (typeof key === 'string' && POLLUTION_KEYS.has(key)) {
        return true;
      }
      if (walk((obj as Record<string | symbol, unknown>)[key])) {
        return true;
      }
    }
    return false;
  };

  return walk(input);
}

export class UpdateSettingDto {
  /**
   * Setting value — kept as `unknown` because settings store mixed JSON
   * payloads (numbers, booleans, strings, nested objects, arrays). Type-level
   * validation is performed at the service layer per setting key; this DTO
   * only enforces that *something* was provided and that the payload does
   * not contain prototype-pollution keys (see SettingsController).
   */
  @IsDefined()
  @IsNotEmpty()
  value: unknown;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateHolidaysDto {
  // @IsArray asserts array-ness so a scalar string cannot slip past @IsString({each:true}).
  @IsArray()
  @ArrayMaxSize(1000)
  @IsNotEmpty()
  @IsString({ each: true })
  holidays!: string[];
}
