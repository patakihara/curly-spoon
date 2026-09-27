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

The Kotlin generator accepts the OpenAPI subset zod emits, and nothing else:

- a component that is an object with properties, or a string enum;
- a property that is `string` (`String`), `boolean` (`Boolean`), `number` (`Double`), `integer`
  (`Long`, or `Int` for format `int32`), an array of any accepted shape (`List<T>`), an inline
  string enum, or a `$ref` to another component;
- a nullable property, written `type: [<type>, "null"]` or, for a reference, an `allOf`, `anyOf`
  or `oneOf` of exactly one `$ref` and one schema whose only key is a type including `null`. It
  becomes `T?`; a property left out of `required` becomes `T? = null`.

An inline enum becomes the class `<Component><Property>` (`Item` appended for an array's items).
The generator throws, naming the component and property, on anything else: any other
`allOf`/`anyOf`/`oneOf`, a nested inline object, a type list with more than one non-null type,
a non-string enum, two enum values with the same constant name, an array without `items`, an
unresolvable `$ref`, a component or property name that is not a Kotlin identifier (or is a Kotlin
keyword), and an inline enum class name that a component or another inline enum already has.
