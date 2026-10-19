/**
 * Test-only: checks an answer against the committed OpenAPI document, as the clients are
 * generated from it. `againstOpenApi(method, path, body)` lists how `body` fails the document's
 * 200 answer to `method path`, and nothing when it fits.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';

const openApi = new Ajv2020({ strict: false, allErrors: true }).addSchema(
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../../../schema/generated/openapi.json', import.meta.url)),
      'utf8',
    ),
  ) as object,
  'openapi',
);

export function againstOpenApi(method: string, path: string, body: unknown): string[] {
  const pointer = ['paths', path, method, 'responses', '200', 'content']
    .concat(['application/json', 'schema'])
    .map((part) => part.replaceAll('~', '~0').replaceAll('/', '~1'))
    .join('/');
  const validate = openApi.compile({ $ref: `openapi#/${pointer}` });
  return validate(body)
    ? []
    : (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message ?? ''}`);
}
