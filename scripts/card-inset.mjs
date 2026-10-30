/**
 * Card inset rule (follow-count D5): a painted card keeps every text line at
 * least `MIN_CARD_TEXT_INSET_PX` inside each painted edge — left, right and
 * bottom. A card that paints nothing (flat) is unconstrained.
 *
 * "Painted" means any of: a computed background colour or image that differs
 * from the effective background behind the card, a visible border side, or a
 * box-shadow other than `none`.
 *
 * Two parts:
 * - `collectCardInsets`: runs inside the page (`page.evaluate`), so it is
 *   self-contained. It measures text with `Range` client rects of the text
 *   nodes, never element boxes, and skips text that is not visible (visually
 *   hidden, clipped, zero opacity, `visibility: hidden`) and media.
 * - `cardInsetFailures`: pure; decides pass/fail from the collected facts.
 */

/** @type {number} minimum distance, in CSS px, between text and a painted edge. */
export const MIN_CARD_TEXT_INSET_PX = 12;

/** @type {readonly string[]} the card-like containers the rule covers. */
export const CARD_SELECTORS = [
  '.g-card',
  '.g-card-row',
  '.g-panel',
  '.g-author-card',
  '.g-series-card',
  '.g-series-box',
];

/**
 * Browser-side collector. Must stay self-contained (it is serialised by
 * `page.evaluate`). Returns one record per matched element.
 *
 * @param {readonly string[]} selectors
 * @returns {{selector: string, index: number, painted: string[], insets: {left: number, right: number, bottom: number}|null, textLines: number}[]}
 */
export function collectCardInsets(selectors) {
  /* eslint-disable no-undef -- runs in the browser. */
  const parseColor = (value) => {
    const match =
      /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/u.exec(
        value.trim(),
      );
    if (!match) return value.trim() === 'transparent' ? null : value.trim();
    let alpha = match[4] === undefined ? 1 : parseFloat(match[4]);
    if (match[4] && match[4].endsWith('%')) alpha /= 100;
    return alpha === 0 ? null : `${match[1]},${match[2]},${match[3]},${alpha}`;
  };
  const effectiveBackground = (element) => {
    for (let node = element.parentElement; node; node = node.parentElement) {
      const color = parseColor(getComputedStyle(node).backgroundColor);
      if (color) return color;
    }
    return 'canvas';
  };
  const MEDIA = new Set(['IMG', 'SVG', 'VIDEO', 'PICTURE', 'CANVAS', 'IFRAME']);
  const clipRectFor = (element, card) => {
    // Intersection of every overflow-clipping ancestor (inside the card) and
    // any `clip`/`clip-path` rect, as {left,right,top,bottom} or null.
    let box = null;
    for (let node = element; node && node !== card.parentElement;) {
      const style = getComputedStyle(node);
      const clips =
        (style.overflowX !== 'visible' || style.overflowY !== 'visible') &&
        node !== card;
      if (clips) {
        const rect = node.getBoundingClientRect();
        box = box
          ? {
              left: Math.max(box.left, rect.left),
              right: Math.min(box.right, rect.right),
              top: Math.max(box.top, rect.top),
              bottom: Math.min(box.bottom, rect.bottom),
            }
          : {
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom,
            };
      }
      node = node.parentElement;
    }
    return box;
  };
  const textHidden = (element, card) => {
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.visibility === 'collapse' ||
        parseFloat(style.opacity) === 0
      ) {
        return true;
      }
      if (node !== card) {
        const rect = node.getBoundingClientRect();
        const clippedBox =
          (style.overflowX !== 'visible' || style.overflowY !== 'visible') &&
          (rect.width <= 1 || rect.height <= 1);
        const clipRect =
          style.clip !== 'auto' &&
          style.position === 'absolute' &&
          /rect\(\s*0(px)?[ ,]+0(px)?[ ,]+0(px)?[ ,]+0(px)?\s*\)/u.test(
            style.clip,
          );
        const clipPath =
          /inset\(\s*(50|100)%/u.test(style.clipPath) ||
          /inset\(\s*0(px)?\s+100%/u.test(style.clipPath);
        if (clippedBox || clipRect || clipPath) return true;
      }
      if (node === card) break;
    }
    return false;
  };
  const records = [];
  for (const selector of selectors) {
    const cards = Array.from(document.querySelectorAll(selector));
    cards.forEach((card, index) => {
      const style = getComputedStyle(card);
      const painted = [];
      const bg = parseColor(style.backgroundColor);
      if (
        (bg && bg !== effectiveBackground(card)) ||
        (style.backgroundImage && style.backgroundImage !== 'none')
      ) {
        painted.push('background');
      }
      const borderVisible = ['Top', 'Right', 'Bottom', 'Left'].some(
        (side) =>
          style[`border${side}Style`] !== 'none' &&
          style[`border${side}Style`] !== 'hidden' &&
          parseFloat(style[`border${side}Width`]) > 0 &&
          parseColor(style[`border${side}Color`]) !== null,
      );
      if (borderVisible) painted.push('border');
      if (style.boxShadow && style.boxShadow !== 'none') {
        painted.push('shadow');
      }
      const rect = card.getBoundingClientRect();
      const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      let left = Infinity;
      let right = Infinity;
      let bottom = Infinity;
      let lines = 0;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.nodeValue || node.nodeValue.trim() === '') continue;
        const parent = node.parentElement;
        if (!parent) continue;
        let inMedia = false;
        for (let up = parent; up && up !== card.parentElement;) {
          if (
            MEDIA.has(up.tagName.toUpperCase()) ||
            (up !== card && up.matches('.g-card-media, .g-hero-media'))
          ) {
            inMedia = true;
            break;
          }
          up = up.parentElement;
        }
        if (inMedia || textHidden(parent, card)) continue;
        const clip = clipRectFor(parent, card);
        range.selectNodeContents(node);
        for (const textRect of Array.from(range.getClientRects())) {
          if (textRect.width < 0.5 || textRect.height < 0.5) continue;
          if (
            clip &&
            (textRect.right <= clip.left ||
              textRect.left >= clip.right ||
              textRect.bottom <= clip.top ||
              textRect.top >= clip.bottom)
          ) {
            continue;
          }
          lines += 1;
          left = Math.min(left, textRect.left - rect.left);
          right = Math.min(right, rect.right - textRect.right);
          bottom = Math.min(bottom, rect.bottom - textRect.bottom);
        }
      }
      records.push({
        selector,
        index,
        painted,
        insets: lines === 0 ? null : { left, right, bottom },
        textLines: lines,
      });
    });
  }
  /* eslint-enable no-undef */
  return records;
}

/**
 * Decide the rule for one page's collected cards. Pure.
 *
 * @param {object} input
 * @param {string} input.theme
 * @param {string} input.palette
 * @param {number} input.width
 * @param {string} input.route
 * @param {readonly {selector: string, index: number, painted: readonly string[], insets: {left: number, right: number, bottom: number}|null}[]} input.cards
 * @param {number} [input.minInset]
 * @returns {string[]} one message per violated edge
 */
export function cardInsetFailures({
  theme,
  palette,
  width,
  route,
  cards,
  minInset = MIN_CARD_TEXT_INSET_PX,
}) {
  /** @type {Map<string, {selector: string, painted: string, edge: string, worst: number, count: number}>} */
  const worstByEdge = new Map();
  for (const card of cards) {
    if (card.painted.length === 0 || card.insets === null) continue;
    for (const edge of /** @type {const} */ (['left', 'right', 'bottom'])) {
      const inset = card.insets[edge];
      if (inset >= minInset - 0.01) continue;
      const painted = card.painted.join('+');
      const key = `${card.selector}|${painted}|${edge}`;
      const seen = worstByEdge.get(key);
      if (seen) {
        seen.count += 1;
        seen.worst = Math.min(seen.worst, inset);
      } else {
        worstByEdge.set(key, {
          selector: card.selector,
          painted,
          edge,
          worst: inset,
          count: 1,
        });
      }
    }
  }
  return [...worstByEdge.values()].map(
    (entry) =>
      `${theme} ${route} ${palette} ${width}px: ${entry.selector} paints ` +
      `${entry.painted} but its text is ${entry.worst.toFixed(1)}px from the ` +
      `${entry.edge} edge (minimum ${minInset}px; ${entry.count} card(s)): ` +
      'pad the card or make it paint nothing',
  );
}
