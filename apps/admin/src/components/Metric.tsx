import Link from 'next/link';

/** Small colour-coded metric chip used inside every card's analytics drawer.
 *  When `href` is provided the chip becomes a link that drills into the matching
 *  records; otherwise it stays a plain display-only div. */
export function Metric({
  color,
  label,
  value,
  big,
  href,
}: {
  color: string;
  label: string;
  value: string;
  big?: boolean;
  href?: string;
}) {
  const cls = `metricchip ${color}${big ? ' big' : ''}`;
  const inner = (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={`${cls} metricchip--link`}>
        {inner}
      </Link>
    );
  }
  return <div className={cls}>{inner}</div>;
}
