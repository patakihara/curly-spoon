import createClient, { type Client } from 'openapi-fetch';
import { type components, type paths } from '../generated/api/schema';

export type HealthResponse = components['schemas']['HealthResponse'];
export type ApiClient = Client<paths>;

/** The typed API client. Same origin by default; tests inject `fetch` and a base URL. */
export function createApiClient(
  options: { baseUrl?: string; fetch?: (request: Request) => Promise<Response> } = {},
): ApiClient {
  return createClient<paths>({ baseUrl: options.baseUrl ?? '', fetch: options.fetch });
}

export async function fetchHealth(client: ApiClient): Promise<HealthResponse> {
  const { data, response } = await client.GET('/api/health');
  if (data === undefined) throw new Error(`GET /health answered ${response.status}`);
  return data;
}
