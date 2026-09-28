/**
 * ESLint rule `auralis/no-hand-ui`: the web app draws no UI by hand. A file in web/src outside
 * generated/ may compose generated pages and Sonora components only, so it may not render an
 * intrinsic element (`<div>`, `<span>`, `createElement('section')`) or set `style` or `className`.
 * A screen that needs something new is added to the design first (docs/plan/12-front.md).
 *
 * HAND_UI_ALLOWED is the whole allowlist, one glob per entry with the reason it draws nothing
 * that ships. eslint.config.js applies the rule to web/src minus these and generated/.
 */
const DESIGN_FIRST =
  'is hand-drawn UI: add it to the design and compose the generated page or a Sonora component';

export const HAND_UI_ALLOWED = [
  // Tests may wrap what they render in a harness element; nothing in them ships.
  'web/src/**/*.test.{ts,tsx}',
];

const elementName = (name) =>
  name.type === 'JSXIdentifier'
    ? name.name
    : name.type === 'JSXNamespacedName'
      ? `${name.namespace.name}:${name.name.name}`
      : null;

export const noHandUi = {
  meta: {
    type: 'problem',
    docs: { description: 'web/src composes generated pages and Sonora components only' },
    schema: [],
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const name = elementName(node.name);
        if (name !== null && /^[a-z]/.test(name)) {
          context.report({ node, message: `<${name}> ${DESIGN_FIRST}` });
        }
      },
      JSXAttribute(node) {
        const name = node.name.type === 'JSXIdentifier' ? node.name.name : null;
        if (name === 'style' || name === 'className') {
          context.report({ node, message: `${name} styles by hand: styling belongs to Sonora` });
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        const name =
          callee.type === 'Identifier'
            ? callee.name
            : callee.type === 'MemberExpression' && callee.property.type === 'Identifier'
              ? callee.property.name
              : null;
        const [first] = node.arguments;
        if (
          name === 'createElement' &&
          first?.type === 'Literal' &&
          typeof first.value === 'string'
        ) {
          context.report({ node, message: `createElement('${first.value}') ${DESIGN_FIRST}` });
        }
      },
    };
  },
};
