import {
  APPROVED_BRAND_SURFACES,
  contrastRatio,
  hasApprovedBrandAccentContrast,
  relativeLuminance,
} from './brand-color.util';

describe('brand-color utilities', () => {
  it('uses WCAG sRGB luminance and contrast calculations', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#FFFFFF')).toBe(1);
    expect(contrastRatio('#000000', '#FFFFFF')).toBe(21);
  });

  it('accepts an accent that contrasts by at least 3:1 in both modes', () => {
    expect(APPROVED_BRAND_SURFACES).toEqual({
      light: '#FFFFFF',
      dark: '#121212',
    });
    expect(hasApprovedBrandAccentContrast('#2563EB')).toBe(true);
  });

  it.each(['#000000', '#FFFFFF'])(
    'rejects %s when it cannot distinguish from an approved surface',
    (color) => {
      expect(hasApprovedBrandAccentContrast(color)).toBe(false);
    },
  );
});
