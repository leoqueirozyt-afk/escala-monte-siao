export function digits(value: string): string {
  return value.replace(/\D/g, "");
}

export function isValidPhone(value: string): boolean {
  const d = digits(value);
  if (d.length !== 10 && d.length !== 11) return false;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return false;
  if (d.length === 11 && d[2] !== "9") return false;
  return true;
}

export function maskPhone(value: string): string {
  const d = digits(value).slice(0, 11);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  const body = d.slice(2);
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${body}`;
  return `(${d.slice(0, 2)}) ${body.slice(0, 5)}-${body.slice(5)}`;
}

export function formatPhone(value: string): string {
  if (!isValidPhone(value)) throw new Error("Telefone inválido. Use o formato (11) 99999-9999.");
  const d = digits(value);
  const body = d.slice(2);
  return d.length === 11
    ? `(${d.slice(0, 2)}) ${body.slice(0, 5)}-${body.slice(5)}`
    : `(${d.slice(0, 2)}) ${body.slice(0, 4)}-${body.slice(4)}`;
}
