export default function Avatar({ name }: { name: string }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-tint text-accent font-display font-bold text-sm"
      aria-hidden="true"
    >
      {initials || "?"}
    </div>
  );
}
