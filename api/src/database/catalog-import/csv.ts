/**
 * Lector de CSV (RFC 4180): comillas dobles, comas y saltos de línea dentro de comillas, BOM de Excel.
 * El separador es la coma o, si el encabezado no tiene comas, el punto y coma (Excel en español).
 * Devuelve una fila por línea con las columnas por nombre de encabezado (en minúsculas).
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  const headerLine = input.split(/\r?\n/, 1)[0];
  const delimiter = !headerLine.includes(',') && headerLine.includes(';') ? ';' : ',';
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field || row.length) rows.push([...row, field]);

  const [header, ...data] = rows.filter((r) => r.some((cell) => cell.trim() !== ''));
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase());
  return data.map((cells) => Object.fromEntries(keys.map((key, index) => [key, (cells[index] ?? '').trim()])));
}
