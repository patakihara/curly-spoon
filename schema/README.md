# schema

The one place an API shape is written. Everything else that knows the API's shapes is generated
from here.

- `src/` holds the zod schemas and the route declarations (method, path, response schema). The
  server serves each declared route and parses its answer through the route's schema.
- `codegen/` turns them into three files:
  - `schema/generated/openapi.json`, the OpenAPI 3.1 document (zod-to-openapi);
  - `web/src/generated/api/schema.ts`, the web client's types (openapi-typescript), used through
    openapi-fetch in `web/src/api/client.ts`;
  - `android/app/src/main/java/net/develivarr/auralis/generated/api/ApiModels.kt`, the Android
    models as kotlinx.serialization data classes, from the in-repo generator `codegen/kotlin.ts`.

Run `pnpm gen` after changing `src/` and commit its output. CI regenerates and fails when the
committed output differs. Folders named `generated` are never edited by hand.

The Kotlin generator accepts the OpenAPI subset zod emits: objects with properties, string enums
(top-level or inline), `string`, `boolean`, `number`, `integer` (`int64` becomes `Long`), arrays,
`$ref` to another component, nullable and optional properties. Anything else makes it throw,
naming the component and property.
