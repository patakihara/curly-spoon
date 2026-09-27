import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Every schema imports z from here, so `.openapi('Name')` names it as an OpenAPI component.
extendZodWithOpenApi(z);

export { z };
