/**
 * Spike-scoped re-export surface for the Mantine migration (see docs/HANDOVER.md's
 * phase notes on the design-system spike). `@mantine/core` is a dependency of
 * *this* package, not `apps/web` — pnpm's strict `node_modules` layout means
 * `apps/web` cannot `import` from `@mantine/core` directly without also declaring
 * it as a dependency there, which this spike deliberately avoids (no `pnpm add`
 * mid-migration, see `CLAUDE.md`'s lockfile-corruption warning). So `apps/web`
 * consumes Mantine primitives the same way it already consumes every other UI
 * primitive: through `@auralis/ui`.
 *
 * Names are prefixed `Mantine*` to keep them unambiguous next to this package's
 * own M3 components of almost the same name (`Card`, in particular) while this
 * spike has both in the tree side by side.
 */
export { AppShell as MantineAppShell } from '@mantine/core';
export { NavLink as MantineNavLink } from '@mantine/core';
export { Card as MantineCard, type CardProps as MantineCardProps } from '@mantine/core';
export { Image as MantineImage, type ImageProps as MantineImageProps } from '@mantine/core';
