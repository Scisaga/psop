export function BrandMark({ className = 'brand-mark' }: { className?: string }) {
  return <img
    className={`psop-mark ${className}`}
    src="/assets/brand/psop-mark.svg"
    alt="PSOP"
    width={34}
    height={34}
    draggable={false}
  />;
}
