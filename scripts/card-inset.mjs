/**
 * Card rules for `visual:check` (follow-count D5 and its follow-ups).
 *
 * Rule 1, painted cards: a card that paints a box keeps every text line at
 * least `MIN_CARD_TEXT_INSET_PX` inside the edges of the box that paints
 * behind that line — left, right and bottom. "Paints" means a computed
 * background colour or image that differs from what is behind it, a visible
 * border on the left or right (a box), or a box-shadow other than `none`.
 * The box that counts for a line is the nearest (smallest) painted box that
 * contains it between the text and the card, with the card as the outermost:
 * the card itself, a wide descendant (>= 90% of the card's width, never
 * media) or the `::before`/`::after` of either. A border on the top or the
 * bottom only is a rule, not a box: it constrains the bottom edge only.
 * Narrow painted descendants (chips, buttons) are not card surfaces.
 *
 * Rule 2, flat cards: a card that paints no box and has media stacked above
 * its text keeps the start edge of every row of text within
 * `FLAT_ALIGNMENT_TOLERANCE_PX` of the media's start edge (the physical left
 * edge, or the right edge in RTL). Side-by-side media and cards without media
 * are out of scope.
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
/** @type {number} how far a flat card's text may sit from the media's start edge. */
export const FLAT_ALIGNMENT_TOLERANCE_PX = 1;

// `.g-search-hit` is deliberately absent: search hits are menu rows (their
// .7rem padding is menu-row padding, not a card).
/** @type {readonly string[]} the card-like containers the rules cover. */
export const CARD_SELECTORS = [
  '.g-card',
  '.g-card-row',
  '.g-panel',
  '.g-author-card',
  '.g-series-card',
  '.g-series-box',
  '.g-interactions',
  '.g-listen-list',
  '.g-consent',
  '.g-pager-link',
  '.g-toc-mobile',
];

/**
 * @typedef {{left: number, right: number, top: number, bottom: number}} Box
 * @typedef {{label: string, bottomOnly: boolean, insets: {left: number, right: number, bottom: number}}} Surface
 * @typedef {{
 *   selector: string,
 *   index: number,
 *   painted: readonly string[],
 *   paintsBox: boolean,
 *   surfaces: readonly Surface[],
 *   lines: readonly Box[],
 *   media: Box|null,
 *   direction: string,
 * }} CardRecord
 */

/**
 * Browser-side collector. Must stay self-contained (it is serialised by
 * `page.evaluate`). Returns one record per matched element.
 *
 * @param {readonly string[]} selectors
 * @returns {CardRecord[]}
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
  /** The colour behind `element`: the first ancestor with a painted background. */
  const backdropOf = (element) => {
    for (let node = element.parentElement; node; node = node.parentElement) {
      const color = parseColor(getComputedStyle(node).backgroundColor);
      if (color) return color;
    }
    return 'canvas';
  };
  /** Which kinds of paint a computed style adds over `backdrop`. */
  const kindsOf = (style, backdrop, isCard) => {
    const visible = (side) =>
      style[`border${side}Style`] !== 'none' &&
      style[`border${side}Style`] !== 'hidden' &&
      parseFloat(style[`border${side}Width`]) > 0 &&
      parseColor(style[`border${side}Color`]) !== null;
    const sides = ['Top', 'Right', 'Bottom', 'Left'].filter(visible);
    const kinds = [];
    const bg = parseColor(style.backgroundColor);
    if (
      (bg && bg !== backdrop) ||
      (style.backgroundImage && style.backgroundImage !== 'none')
    ) {
      kinds.push('background');
    }
    // A card with a left or right border paints it. On a descendant, one or
    // two sides are an accent rule (a TOC's left rule), not a box: a box
    // needs both left and right, or three sides.
    const boxBorder =
      sides.length >= 3 ||
      (sides.includes('Left') && sides.includes('Right')) ||
      (isCard && (sides.includes('Left') || sides.includes('Right')));
    if (boxBorder) kinds.push('border');
    else if (sides.length > 0) kinds.push('rule');
    if (style.boxShadow && style.boxShadow !== 'none') kinds.push('shadow');
    return kinds;
  };
  const boxRect = (rect) => ({
    left: rect.left,
    right: rect.right,
    top: rect.top,
    bottom: rect.bottom,
  });
  /** The painted box of a rendered pseudo-element, in viewport coordinates. */
  const pseudoRect = (host, style) => {
    const hostRect = host.getBoundingClientRect();
    if (style.position !== 'absolute' && style.position !== 'fixed') {
      return boxRect(hostRect);
    }
    let block = host;
    while (block && getComputedStyle(block).position === 'static') {
      block = block.parentElement;
    }
    const blockRect = block
      ? block.getBoundingClientRect()
      : { left: 0, top: 0 };
    const blockStyle = block ? getComputedStyle(block) : null;
    const originLeft =
      blockRect.left +
      (blockStyle ? parseFloat(blockStyle.borderLeftWidth) : 0);
    const originTop =
      blockRect.top + (blockStyle ? parseFloat(blockStyle.borderTopWidth) : 0);
    const left = parseFloat(style.left);
    const top = parseFloat(style.top);
    const width = parseFloat(style.width);
    const height = parseFloat(style.height);
    if ([left, top, width, height].some((value) => Number.isNaN(value))) {
      return boxRect(hostRect);
    }
    return {
      left: originLeft + left,
      top: originTop + top,
      right: originLeft + left + width,
      bottom: originTop + top + height,
    };
  };
  const MEDIA = new Set(['IMG', 'SVG', 'VIDEO', 'PICTURE', 'CANVAS', 'IFRAME']);
  const MEDIA_CLASSES = '.g-card-media, .g-card-placeholder, .g-hero-media';
  const inMedia = (element, card) => {
    for (let up = element; up && up !== card.parentElement;) {
      if (
        MEDIA.has(up.tagName.toUpperCase()) ||
        (up !== card && up.matches(MEDIA_CLASSES))
      ) {
        return true;
      }
      up = up.parentElement;
    }
    return false;
  };
  const clipRectFor = (element, card) => {
    // Intersection of every overflow-clipping ancestor (inside the card).
    let box = null;
    for (let node = element; node && node !== card.parentElement;) {
      const style = getComputedStyle(node);
      if (
        (style.overflowX !== 'visible' || style.overflowY !== 'visible') &&
        node !== card
      ) {
        const rect = node.getBoundingClientRect();
        box = box
          ? {
              left: Math.max(box.left, rect.left),
              right: Math.min(box.right, rect.right),
              top: Math.max(box.top, rect.top),
              bottom: Math.min(box.bottom, rect.bottom),
            }
          : boxRect(rect);
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
  const labelOf = (kinds, source) =>
    kinds.map((kind) => (source ? `${kind}(${source})` : kind)).join('+');
  const describe = (element) =>
    element.tagName.toLowerCase() +
    (element.classList.length > 0 ? `.${element.classList[0]}` : '');

  const records = [];
  for (const selector of selectors) {
    for (const [index, card] of document.querySelectorAll(selector).entries()) {
      const cardRect = card.getBoundingClientRect();
      const wide = (rect) => rect.right - rect.left >= cardRect.width * 0.9;
      /** @type {{label: string, kinds: string[], rect: Box, element: Element|null}[]} */
      const candidates = [];
      const addSurface = (element, rect, kinds, source, isCard) => {
        const useful = isCard
          ? kinds.length > 0
          : kinds.some((kind) => kind !== 'rule');
        if (!useful) return;
        candidates.push({
          label: labelOf(kinds, source),
          kinds,
          rect,
          element,
        });
      };
      const consider = (element, isCard) => {
        const style = getComputedStyle(element);
        const rect = boxRect(element.getBoundingClientRect());
        if (!isCard && inMedia(element, card)) return;
        const backdrop = backdropOf(element);
        const source = isCard ? '' : describe(element);
        if (isCard || wide(rect)) {
          addSurface(
            element,
            rect,
            kindsOf(style, backdrop, isCard),
            source,
            isCard,
          );
        }
        // The backdrop a pseudo-element paints over is its host's own paint.
        const hostBackdrop = parseColor(style.backgroundColor) ?? backdrop;
        for (const pseudo of ['::before', '::after']) {
          const pseudoStyle = getComputedStyle(element, pseudo);
          if (
            pseudoStyle.content === 'none' ||
            pseudoStyle.content === 'normal'
          ) {
            continue;
          }
          if (pseudoStyle.display === 'none') continue;
          const pRect = pseudoRect(element, pseudoStyle);
          if (!isCard && !wide(pRect)) continue;
          if (isCard && pRect.right - pRect.left < cardRect.width * 0.5) {
            continue;
          }
          addSurface(
            element,
            pRect,
            kindsOf(pseudoStyle, hostBackdrop, isCard),
            `${isCard ? '' : describe(element)}${pseudo}`,
            isCard,
          );
        }
      };
      consider(card, true);
      for (const element of card.querySelectorAll('*')) {
        if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml') continue;
        consider(element, false);
      }
      const areaOf = (rect) =>
        Math.max(0, rect.right - rect.left) *
        Math.max(0, rect.bottom - rect.top);
      const contains = (rect, line) => {
        const x = (line.left + line.right) / 2;
        const y = (line.top + line.bottom) / 2;
        return (
          x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
        );
      };

      const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      /** @type {Map<string, {label: string, bottomOnly: boolean, insets: {left: number, right: number, bottom: number}}>} */
      const governed = new Map();
      const lines = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.nodeValue || node.nodeValue.trim() === '') continue;
        const parent = node.parentElement;
        if (!parent) continue;
        if (inMedia(parent, card) || textHidden(parent, card)) continue;
        const clip = clipRectFor(parent, card);
        // A line inside a small painted box (a chip) is aligned by that box.
        let alignBox = null;
        for (let up = parent; up && up !== card; up = up.parentElement) {
          const upRect = up.getBoundingClientRect();
          if (
            upRect.width < cardRect.width * 0.9 &&
            kindsOf(getComputedStyle(up), backdropOf(up), false).some(
              (kind) => kind !== 'rule',
            )
          ) {
            alignBox = boxRect(upRect);
          }
        }
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
          const line = boxRect(textRect);
          lines.push(
            alignBox
              ? { ...line, left: alignBox.left, right: alignBox.right }
              : line,
          );
          const owner = candidates
            .filter((candidate) => contains(candidate.rect, line))
            .sort((a, b) => areaOf(a.rect) - areaOf(b.rect))[0];
          if (!owner) continue;
          const entry = governed.get(owner.label) ?? {
            label: owner.label,
            bottomOnly: owner.kinds.every((kind) => kind === 'rule'),
            insets: { left: Infinity, right: Infinity, bottom: Infinity },
          };
          entry.insets.left = Math.min(
            entry.insets.left,
            line.left - owner.rect.left,
          );
          entry.insets.right = Math.min(
            entry.insets.right,
            owner.rect.right - line.right,
          );
          entry.insets.bottom = Math.min(
            entry.insets.bottom,
            owner.rect.bottom - line.bottom,
          );
          governed.set(owner.label, entry);
        }
      }
      let mediaBox = null;
      for (const element of card.querySelectorAll(MEDIA_CLASSES)) {
        const rect = element.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          mediaBox = boxRect(rect);
          break;
        }
      }
      records.push({
        selector,
        index,
        painted: candidates.map((candidate) => candidate.label),
        paintsBox: candidates.some((candidate) =>
          candidate.kinds.some((kind) => kind !== 'rule'),
        ),
        surfaces: [...governed.values()],
        lines,
        media: mediaBox,
        direction: getComputedStyle(card).direction,
      });
    }
  }
  /* eslint-enable no-undef */
  return records;
}

/**
 * The tightest inset a record's governed surfaces leave, or `null` when no
 * painted box governs any text line.
 *
 * @param {CardRecord} card
 * @returns {{left: number, right: number, bottom: number}|null}
 */
export function minInsets(card) {
  if (card.surfaces.length === 0) return null;
  return card.surfaces.reduce(
    (acc, surface) => ({
      left: surface.bottomOnly
        ? acc.left
        : Math.min(acc.left, surface.insets.left),
      right: surface.bottomOnly
        ? acc.right
        : Math.min(acc.right, surface.insets.right),
      bottom: Math.min(acc.bottom, surface.insets.bottom),
    }),
    { left: Infinity, right: Infinity, bottom: Infinity },
  );
}

/**
 * Group text lines into visual rows (vertical overlap above half the shorter
 * line) and return each row's start-edge offset from the media's start edge.
 *
 * @param {readonly Box[]} lines
 * @param {Box} media
 * @param {string} direction
 * @returns {number[]} one signed offset per row; the row's line nearest the start edge
 */
export function rowStartOffsets(lines, media, direction) {
  const rtl = direction === 'rtl';
  const sorted = [...lines].sort((a, b) => a.top - b.top);
  /** @type {Box[][]} */
  const rows = [];
  for (const line of sorted) {
    const row = rows.find((candidate) => {
      const top = Math.max(candidate[0].top, line.top);
      const bottom = Math.min(candidate[0].bottom, line.bottom);
      const shorter = Math.min(
        candidate[0].bottom - candidate[0].top,
        line.bottom - line.top,
      );
      return bottom - top > shorter / 2;
    });
    if (row) row.push(line);
    else rows.push([line]);
  }
  return rows.map((row) =>
    rtl
      ? Math.min(...row.map((line) => media.right - line.right))
      : Math.min(...row.map((line) => line.left - media.left)),
  );
}

/**
 * Decide both rules for one page's collected cards. Pure.
 *
 * @param {object} input
 * @param {string} input.theme
 * @param {string} input.palette
 * @param {number} input.width
 * @param {string} input.route
 * @param {readonly CardRecord[]} input.cards
 * @param {number} [input.minInset]
 * @returns {string[]} one message per violated edge or misaligned card kind
 */
export function cardInsetFailures({
  theme,
  palette,
  width,
  route,
  cards,
  minInset = MIN_CARD_TEXT_INSET_PX,
}) {
  const where = `${theme} ${route} ${palette} ${width}px`;
  /** @type {Map<string, {selector: string, label: string, edge: string, worst: number, count: number}>} */
  const worstByEdge = new Map();
  /** @type {Map<string, {selector: string, worst: number, count: number}>} */
  const misaligned = new Map();
  for (const card of cards) {
    for (const surface of card.surfaces) {
      for (const edge of /** @type {const} */ (['left', 'right', 'bottom'])) {
        if (surface.bottomOnly && edge !== 'bottom') continue;
        const inset = surface.insets[edge];
        if (inset >= minInset - 0.01) continue;
        const key = `${card.selector}|${surface.label}|${edge}`;
        const seen = worstByEdge.get(key);
        if (seen) {
          seen.count += 1;
          seen.worst = Math.min(seen.worst, inset);
        } else {
          worstByEdge.set(key, {
            selector: card.selector,
            label: surface.label,
            edge,
            worst: inset,
            count: 1,
          });
        }
      }
    }
    if (card.paintsBox || !card.media || card.lines.length === 0) continue;
    const media = card.media;
    // Out of scope unless the media sits above every line of text.
    if (card.lines.some((line) => line.top < media.bottom - 1)) continue;
    const offsets = rowStartOffsets(card.lines, media, card.direction);
    const worst = offsets.reduce(
      (acc, offset) => (Math.abs(offset) > Math.abs(acc) ? offset : acc),
      0,
    );
    if (Math.abs(worst) > FLAT_ALIGNMENT_TOLERANCE_PX + 0.01) {
      const seen = misaligned.get(card.selector);
      if (seen) {
        seen.count += 1;
        if (Math.abs(worst) > Math.abs(seen.worst)) seen.worst = worst;
      } else {
        misaligned.set(card.selector, {
          selector: card.selector,
          worst,
          count: 1,
        });
      }
    }
  }
  return [
    ...[...worstByEdge.values()].map(
      (entry) =>
        `${where}: ${entry.selector} paints ${entry.label} but its text is ` +
        `${entry.worst.toFixed(1)}px from the ${entry.edge} edge (minimum ` +
        `${minInset}px; ${entry.count} card(s)): pad the card or make it ` +
        'paint nothing',
    ),
    ...[...misaligned.values()].map(
      (entry) =>
        `${where}: ${entry.selector} paints nothing and its media is stacked ` +
        `above the text, but its text starts ${entry.worst.toFixed(1)}px from ` +
        `the media's start edge (tolerance ${FLAT_ALIGNMENT_TOLERANCE_PX}px; ` +
        `${entry.count} card(s)): align the text with the media or paint the card`,
    ),
  ];
}
