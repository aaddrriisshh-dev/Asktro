/** Small colour-coded metric chip used inside every card's analytics drawer. */
export function Metric({
  color,
  label,
  value,
  big,
}: {
  color: string;
  label: string;
  value: string;
  big?: boolean;
}) {
  return (
    <div className={`metricchip ${color}${big ? ' big' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
