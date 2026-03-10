/**
 * StatCard — a simple stats display card used on list pages.
 */

export function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
      <span className="flex-1 text-base text-muted-foreground">{label}</span>
      <span className="text-xl font-medium text-foreground">{value}</span>
    </div>
  )
}
