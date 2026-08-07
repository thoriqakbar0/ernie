import { clipboard } from "electron";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

export class ClipboardWriteError extends Schema.TaggedErrorClass<ClipboardWriteError>()(
  "ClipboardWriteError",
  { message: Schema.String, cause: Schema.optionalKey(Schema.Defect()) },
) {}

/** Write-only clipboard capability. It intentionally exposes no clipboard read authority. */
export class ClipboardWriter extends Context.Service<ClipboardWriter, {
  readonly writeText: (text: string) => Effect.Effect<void, ClipboardWriteError>;
}>()("@ernie/main/ClipboardWriter") {}

const make = Effect.succeed(ClipboardWriter.of({
  writeText: (text) => Effect.try({
    try: () => clipboard.writeText(text),
    catch: (cause) => new ClipboardWriteError({ message: "Unable to write text to the clipboard.", cause }),
  }),
}));

export const layer = Layer.effect(ClipboardWriter, make);
