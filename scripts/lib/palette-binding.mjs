/**
 * The token keys a theme's `palette.follow` binds to the author's colours.
 * Those tokens are written by the template's palette sheet and nowhere
 * else, so `tokens.css` must not declare them and the stylesheets must not
 * set their custom properties.
 *
 * @param {{palette?: {follow?: {key?: unknown}[]}}} theme parsed theme.json
 * @returns {Set<string>} the bound keys (empty for a theme with no palette)
 */
export function boundKeysOf(theme) {
  const follow = Array.isArray(theme?.palette?.follow)
    ? theme.palette.follow
    : [];
  return new Set(
    follow.map((entry) => entry?.key).filter((key) => typeof key === 'string'),
  );
}
