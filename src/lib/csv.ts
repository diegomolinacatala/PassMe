/**
 * Spreadsheet exports: every cell quoted, formulas neutralized (CSV injection),
 * UTF-8 with BOM so Excel opens accents correctly.
 */

/**
 * Phones are exempt from the formula guard: they are validated to digits and
 * + ( ) . - only, so a leading "+" can't start a dangerous formula and must
 * stay readable.
 */
export function csvCell(value: string, { isPhone = false } = {}): string {
  const safe = !isPhone && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

const BOM = String.fromCharCode(0xfeff);

/** Rows of already-built cells (see `csvCell`) into one file. */
export function csvFile(header: readonly string[], rows: readonly string[][]): string {
  const lines = [header.map((cell) => csvCell(cell)).join(","), ...rows.map((row) => row.join(","))];
  return `${BOM}${lines.join("\r\n")}\r\n`;
}
