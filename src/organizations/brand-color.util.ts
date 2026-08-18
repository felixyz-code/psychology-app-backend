export const APPROVED_BRAND_SURFACES = {
  light: '#FFFFFF',
  dark: '#121212',
} as const;

const MINIMUM_UI_ACCENT_CONTRAST = 3;

export function normalizeHexColor(color: string) {
  return color.toUpperCase();
}

export function relativeLuminance(hexColor: string) {
  const [red, green, blue] = hexColorToSrgb(hexColor);
  return (
    0.2126 * linearizeSrgb(red) +
    0.7152 * linearizeSrgb(green) +
    0.0722 * linearizeSrgb(blue)
  );
}

export function contrastRatio(first: string, second: string) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

export function hasApprovedBrandAccentContrast(color: string) {
  return Object.values(APPROVED_BRAND_SURFACES).every(
    (surface) => contrastRatio(color, surface) >= MINIMUM_UI_ACCENT_CONTRAST,
  );
}

function hexColorToSrgb(hexColor: string): [number, number, number] {
  return [1, 3, 5].map(
    (index) => Number.parseInt(hexColor.slice(index, index + 2), 16) / 255,
  ) as [number, number, number];
}

function linearizeSrgb(channel: number) {
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}
