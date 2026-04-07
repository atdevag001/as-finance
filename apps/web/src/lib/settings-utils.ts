/** Computes the changed keys between original and current settings */
export function getChangedSettings(
  original: Record<string, string>,
  current: Record<string, string>,
): Record<string, string> {
  const changed: Record<string, string> = {};
  for (const key of Object.keys(current)) {
    const value = current[key];
    if (value !== undefined && value !== original[key]) {
      changed[key] = value;
    }
  }
  return changed;
}
