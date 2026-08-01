export function trimStringInput(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}
