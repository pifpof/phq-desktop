/**
 * GitHub-style heading anchor: lower case, punctuation removed, spaces to hyphens.
 * Used when writing contents links and when rendering headings, so links work in GitHub, Obsidian and the app.
 */
export function anchor(heading: string): string {
  return heading
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-')
}
