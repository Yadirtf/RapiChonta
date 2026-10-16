export function Logo({ compact = false, tone = "light" }: { compact?: boolean; tone?: "light" | "dark" }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="grid size-10 place-items-center rounded-2xl bg-brand text-lg font-black text-ink">R</span>
      {!compact && (
        <span className={`text-xl font-extrabold tracking-tight ${tone === "light" ? "text-white" : "text-ink"}`}>
          Rapi<span className={tone === "light" ? "text-brand" : "text-brand-strong"}>Chonta</span>
        </span>
      )}
    </span>
  );
}
