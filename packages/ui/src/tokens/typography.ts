/**
 * The M3 type scale, extended with Expressive's emphasised variants — same size and
 * line-height, heavier weight — used on the Now Playing screen and section headers.
 * See docs/DESIGN.md § Type.
 */

export interface TypeSpec {
  /** Font size in CSS px. */
  size: number;
  /** Line height in CSS px (absolute, not unitless, per the M3 spec tables). */
  lineHeight: number;
  /** Font weight, 100-900. */
  weight: number;
  /** Letter-spacing in px. */
  tracking: number;
}

const BASE_ROLES = {
  'display-large': { size: 57, lineHeight: 64, weight: 400, tracking: -0.25 },
  'display-medium': { size: 45, lineHeight: 52, weight: 400, tracking: 0 },
  'display-small': { size: 36, lineHeight: 44, weight: 400, tracking: 0 },
  'headline-large': { size: 32, lineHeight: 40, weight: 400, tracking: 0 },
  'headline-medium': { size: 28, lineHeight: 36, weight: 400, tracking: 0 },
  'headline-small': { size: 24, lineHeight: 32, weight: 400, tracking: 0 },
  'title-large': { size: 22, lineHeight: 28, weight: 500, tracking: 0 },
  'title-medium': { size: 16, lineHeight: 24, weight: 500, tracking: 0.15 },
  'title-small': { size: 14, lineHeight: 20, weight: 500, tracking: 0.1 },
  'body-large': { size: 16, lineHeight: 24, weight: 400, tracking: 0.15 },
  'body-medium': { size: 14, lineHeight: 20, weight: 400, tracking: 0.25 },
  'body-small': { size: 12, lineHeight: 16, weight: 400, tracking: 0.4 },
  'label-large': { size: 14, lineHeight: 20, weight: 500, tracking: 0.1 },
  'label-medium': { size: 12, lineHeight: 16, weight: 500, tracking: 0.5 },
  'label-small': { size: 11, lineHeight: 16, weight: 500, tracking: 0.5 },
} as const satisfies Record<string, TypeSpec>;

type BaseRole = keyof typeof BASE_ROLES;
type EmphasisedRole = `${BaseRole}-emphasised`;

/** Bumps a role's weight to 600-700 (Expressive emphasis) without touching size/line-height. */
function emphasise(spec: TypeSpec): TypeSpec {
  return { ...spec, weight: spec.weight >= 500 ? 700 : 600 };
}

function buildTypeScale(): Record<BaseRole | EmphasisedRole, TypeSpec> {
  const scale = {} as Record<BaseRole | EmphasisedRole, TypeSpec>;
  for (const [role, spec] of Object.entries(BASE_ROLES) as Array<[BaseRole, TypeSpec]>) {
    scale[role] = spec;
    scale[`${role}-emphasised`] = emphasise(spec);
  }
  return scale;
}

/** Every type role — base and `-emphasised` — keyed by name. */
export const TYPE_SCALE = buildTypeScale();

export type TypeRole = keyof typeof TYPE_SCALE;

/** Emits `--m3-type-<role>-{size,line-height,weight,tracking}` custom properties. */
export function typographyCssVars(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [role, spec] of Object.entries(TYPE_SCALE)) {
    vars[`--m3-type-${role}-size`] = `${spec.size}px`;
    vars[`--m3-type-${role}-line-height`] = `${spec.lineHeight}px`;
    vars[`--m3-type-${role}-weight`] = `${spec.weight}`;
    vars[`--m3-type-${role}-tracking`] = `${spec.tracking}px`;
  }
  return vars;
}
