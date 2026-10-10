/**
 * Read the colour stops of a CSS gradient fill so a text colour can be
 * measured against every one of them.
 *
 * Understood: `linear-gradient`, `repeating-linear-gradient`,
 * `radial-gradient`, `repeating-radial-gradient` (one layer, or several
 * layers separated by top-level commas); stop colours written as `#rrggbb`,
 * `#rrggbbaa`, `rgb()`/`rgba()` and `hsl()`/`hsla()` (comma or space
 * syntax), plus the keywords `transparent`, `white` and `black`. Anything
 * else (an image, `none`, `color-mix()`, `var()`, an unknown function or
 * colour name) is reported as unreadable with a reason, never guessed.
 */

const GRADIENT_FUNCTION =
  /^(?:repeating-)?(?:linear|radial)-gradient\(([\s\S]*)\)$/u;

/**
 * @param {string} text text containing commas
 * @returns {string[]} the pieces split at commas outside any parentheses
 */
function splitTopLevel(text) {
  const pieces = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (char === ',' && depth === 0) {
      pieces.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  pieces.push(text.slice(start).trim());
  return pieces;
}

/**
 * @param {number} value a channel in [0, 255]
 * @returns {string} two lowercase hex digits
 */
function hex2(value) {
  return Math.round(Math.min(255, Math.max(0, value)))
    .toString(16)
    .padStart(2, '0');
}

/**
 * @param {string} text a number or percentage
 * @param {number} scale what 100% means
 * @returns {number} the value, or NaN
 */
function amount(text, scale) {
  const match = /^(-?\d*\.?\d+)(%?)$/u.exec(text);
  if (!match) return Number.NaN;
  return match[2] === '%' ? (Number(match[1]) / 100) * scale : Number(match[1]);
}

/**
 * @param {number} hue degrees
 * @param {number} saturation fraction in [0, 1]
 * @param {number} lightness fraction in [0, 1]
 * @returns {number[]} r, g, b in [0, 255]
 */
function hslToRgb(hue, saturation, lightness) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = (((hue % 360) + 360) % 360) / 60;
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  const base = [
    [chroma, second, 0],
    [second, chroma, 0],
    [0, chroma, second],
    [0, second, chroma],
    [second, 0, chroma],
    [chroma, 0, second],
  ][Math.floor(sector) % 6];
  const offset = lightness - chroma / 2;
  return base.map((channel) => (channel + offset) * 255);
}

/**
 * Parse one CSS colour into an opaque `#rrggbb` or report why it is not.
 *
 * @param {string} text the colour
 * @returns {{hex: string} | {reason: string}} the colour or the reason
 */
export function parseColor(text) {
  const value = text.trim().toLowerCase();
  if (value === 'transparent') return { reason: 'a transparent stop' };
  if (value === 'white') return { hex: '#ffffff' };
  if (value === 'black') return { hex: '#000000' };
  const hex = /^#([0-9a-f]{3,8})$/u.exec(value);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      digits = [...digits].map((digit) => digit + digit).join('');
    }
    if (digits.length === 6) return { hex: `#${digits}` };
    if (digits.length === 8) {
      return digits.endsWith('ff')
        ? { hex: `#${digits.slice(0, 6)}` }
        : { reason: 'a translucent stop' };
    }
    return { reason: `an unreadable colour (${value})` };
  }
  const fn = /^(rgba?|hsla?)\(([^()]*)\)$/u.exec(value);
  if (!fn) {
    const name = /^[a-z-]+/u.exec(value)?.[0] ?? value;
    return { reason: `an unsupported colour (${name})` };
  }
  const parts = fn[2]
    .replace('/', ' ')
    .split(/[\s,]+/u)
    .filter(Boolean);
  if (parts.length !== 3 && parts.length !== 4) {
    return { reason: `an unreadable colour (${fn[1]})` };
  }
  if (parts.length === 4) {
    const alpha = amount(parts[3], 1);
    if (Number.isNaN(alpha)) {
      return { reason: `an unreadable colour (${fn[1]})` };
    }
    if (alpha < 1) return { reason: 'a translucent stop' };
  }
  let channels;
  if (fn[1].startsWith('rgb')) {
    channels = parts.slice(0, 3).map((part) => amount(part, 255));
  } else {
    const hue = Number.parseFloat(parts[0]);
    const saturation = amount(parts[1], 1);
    const lightness = amount(parts[2], 1);
    channels = [hue, saturation, lightness].some(Number.isNaN)
      ? [Number.NaN]
      : hslToRgb(hue, saturation, lightness);
  }
  if (channels.some(Number.isNaN)) {
    return { reason: `an unreadable colour (${fn[1]})` };
  }
  return { hex: `#${channels.map(hex2).join('')}` };
}

const PRELUDE =
  /^(?:to\s|[-+.\d]|circle\b|ellipse\b|closest-|farthest-|at\s|from\s|in\s)/u;

/**
 * @param {string} layer one gradient function
 * @returns {{stops: {hex: string, source: string}[]} | {reason: string}}
 *   every stop of the layer, or why it cannot be read
 */
function parseLayer(layer) {
  const match = GRADIENT_FUNCTION.exec(layer);
  if (!match) return { reason: 'not a gradient' };
  const stops = [];
  for (const argument of splitTopLevel(match[1])) {
    const lowered = argument.toLowerCase();
    // The first argument is a direction/shape (angle, `to …`, size, `at …`).
    if (stops.length === 0 && PRELUDE.test(lowered)) continue;
    const colorText = /^(?:[a-z-]+\([^()]*\)|\S+)/u.exec(argument)?.[0] ?? '';
    const color = parseColor(colorText);
    if ('reason' in color) return { reason: color.reason };
    stops.push({ hex: color.hex, source: colorText });
  }
  if (stops.length < 2)
    return { reason: 'a gradient with fewer than two stops' };
  return { stops };
}

/**
 * @param {string} value a `paint-*` token value
 * @returns {{stops: {hex: string, source: string}[]} | {reason: string}}
 *   every colour stop of every gradient layer, or the reason the fill
 *   cannot be read (the checker reports it as SKIPPED)
 */
export function parseGradientStops(value) {
  const text = value.trim();
  if (!/^(?:repeating-)?(?:linear|radial)-gradient\(/u.test(text)) {
    return {
      reason: /^[a-z-]+\(/u.test(text)
        ? 'an unsupported fill function'
        : 'not a gradient',
    };
  }
  const stops = [];
  for (const layer of splitTopLevel(text)) {
    const parsed = parseLayer(layer);
    if ('reason' in parsed) return parsed;
    stops.push(...parsed.stops);
  }
  return { stops };
}
