/** "Alex Rivera" → "Alex": how the page and the emails address the card's owner. */
export function firstName(name: string): string {
  return name.split(/\s+/)[0] || name;
}
