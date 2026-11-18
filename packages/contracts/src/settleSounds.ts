// Fork-only (MasonLoomis/t3code): sounds played when a thread settles. See FORK.md.
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

/** A file name inside `<T3 home>/userdata/sounds`; empty plays nothing. */
const SettleSoundFile = Schema.String.check(Schema.isMaxLength(255));

export const SettleSoundSettings = Schema.Struct({
  enabled: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
  manualSound: SettleSoundFile.pipe(
    Schema.withDecodingDefault(Effect.succeed("Transformers-G1-Scene-Transition.wav")),
  ),
  automaticSound: SettleSoundFile.pipe(
    Schema.withDecodingDefault(Effect.succeed("Transformers-G1-Transformation.wav")),
  ),
  volume: Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 1 })).pipe(
    Schema.withDecodingDefault(Effect.succeed(0.8)),
  ),
});
export type SettleSoundSettings = typeof SettleSoundSettings.Type;

export const settleSoundsSetting = SettleSoundSettings.pipe(
  Schema.withDecodingDefault(Effect.succeed({})),
);
