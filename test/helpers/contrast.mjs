/** @type {number} the sRGB gamma-linearization breakpoint (WCAG formula). */
const SRGB_GAMMA_THRESHOLD = 0.03928;

/** @type {{r: number, g: number, b: number}} WCAG relative-luminance
 * channel weights. */
const LUMINANCE_WEIGHTS = { r: 0.2126, g: 0.7152, b: 0.0722 };

/**
 * @param {number} channel an sRGB channel value in [0, 1]
 * @returns {number} the linearized channel value (WCAG gamma correction)
 */
function linearizeChannel(channel) {
  return channel <= SRGB_GAMMA_THRESHOLD
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

/**
 * WCAG relative luminance (sRGB-linearized), per the standard formula.
 * Not imported from `scripts/check-contrast.mjs` (which reproduces the
 * same formula for its own conformance-checking purpose): this helper
 * exists so `tokens-fallback.test.mjs` can verify the fallback palette's
 * contrast independently of that script's implementation.
 *
 * @param {string} hexColor a `#rrggbb` color
 * @returns {number} relative luminance in [0, 1]
 */
export function wcagRelativeLuminance(hexColor) {
  const r = parseInt(hexColor.slice(1, 3), 16) / 255;
  const g = parseInt(hexColor.slice(3, 5), 16) / 255;
  const b = parseInt(hexColor.slice(5, 7), 16) / 255;
  return (
    LUMINANCE_WEIGHTS.r * linearizeChannel(r) +
    LUMINANCE_WEIGHTS.g * linearizeChannel(g) +
    LUMINANCE_WEIGHTS.b * linearizeChannel(b)
  );
}

/**
 * @param {string} colorA a `#rrggbb` color
 * @param {string} colorB a `#rrggbb` color
 * @returns {number} the WCAG contrast ratio, >= 1
 */
export function wcagContrastRatio(colorA, colorB) {
  const luminanceA = wcagRelativeLuminance(colorA);
  const luminanceB = wcagRelativeLuminance(colorB);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}
