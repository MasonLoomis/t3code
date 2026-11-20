// Fork-only (MasonLoomis/t3code): sounds played when a thread settles. See FORK.md.
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

/** Sentinel value meaning: play the active sound pack's synthesized settle cue. */
export const SETTLE_SOUND_PACK_DEFAULT = "__pack__";

/** A file name inside `<T3 home>/userdata/sounds`, `__pack__` for pack default, or empty for silent. */
const SettleSoundFile = Schema.String.check(Schema.isMaxLength(255));

export const SettleSoundSettings = Schema.Struct({
  enabled: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
  manualSound: SettleSoundFile.pipe(
    Schema.withDecodingDefault(Effect.succeed(SETTLE_SOUND_PACK_DEFAULT)),
  ),
  automaticSound: SettleSoundFile.pipe(
    Schema.withDecodingDefault(Effect.succeed(SETTLE_SOUND_PACK_DEFAULT)),
  ),
  volume: Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 1 })).pipe(
    Schema.withDecodingDefault(Effect.succeed(0.8)),
  ),
});
export type SettleSoundSettings = typeof SettleSoundSettings.Type;

export const settleSoundsSetting = SettleSoundSettings.pipe(
  Schema.withDecodingDefault(Effect.succeed({})),
);
