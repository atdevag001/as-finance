/**
 * Pure template rendering function.
 *
 * Substitutes all `{{variable}}` placeholders in the template body
 * with values from the variables map. Exported for property testing.
 *
 * @param templateBody - Template string with `{{variable}}` placeholders
 * @param variables - Key-value map of variable substitutions
 * @returns Rendered message string with all placeholders replaced
 */
export function renderTemplate(
  templateBody: string,
  variables: Record<string, string>,
): string {
  return templateBody.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return variables[key] ?? '';
  });
}
