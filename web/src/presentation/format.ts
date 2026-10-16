/** "+573001234567" → "+57 300 123 4567". Otros países se muestran tal cual. */
export const formatPhone = (e164: string | null | undefined) => {
  if (!e164) return "";
  const match = /^\+57(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return match ? `+57 ${match[1]} ${match[2]} ${match[3]}` : e164;
};

export const initials = (givenNames: string, familyNames?: string | null) =>
  [givenNames, familyNames]
    .filter(Boolean)
    .map((part) => part!.trim()[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2) || "·";
