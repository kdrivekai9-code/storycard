export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return !email || email.endsWith("@storycard.placeholder");
}
