/** SVG corner flourish — rotated via CSS to fit each corner. */
export function CornerFlourish({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="24" height="24" viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Outer curve */}
      <path d="M2 22 V6 Q2 2 6 2 H22" stroke="currentColor" strokeWidth="1.5" fill="none" />
      {/* Inner curve */}
      <path d="M6 22 V10 Q6 6 10 6 H22" stroke="currentColor" strokeWidth="0.75" fill="none" opacity="0.5" />
      {/* Diamond accent at the corner */}
      <path d="M2 2 L4 5 L6 2 L4 -1 Z" fill="currentColor" transform="translate(0,1)" opacity="0.8" />
    </svg>
  );
}

interface OrnateFrameProps {
  /** When true, uses brighter gold borders and glow. Default: always-on (static) style. */
  selected?: boolean;
  /** Enable hover effects (for interactive cards). */
  hoverable?: boolean;
  /** Hide bottom corners and bottom border radius. Useful when another element sits below. */
  openBottom?: boolean;
  children: React.ReactNode;
  className?: string;
}

/** Double-line ornamental border with corner flourishes. */
export function OrnateFrame({ selected, hoverable, openBottom, children, className }: OrnateFrameProps) {
  // "static" mode (selected undefined): always-on subtle gold, no hover. Used for the chat container.
  // "interactive" mode (selected defined): bright gold + glow when selected, dim + group-hover when not.
  const isStatic = selected === undefined;
  // When selected is provided, enable hover by default (parent should have `group` class)
  const hasHover = hoverable ?? !isStatic;

  const outerBorder = isStatic
    ? "border-gold/40"
    : selected
    ? "border-gold/80"
    : `border-gold/20 ${hasHover ? "group-hover:border-gold/40" : ""}`;

  const innerBorder = isStatic
    ? "border-gold/15"
    : selected
    ? "border-gold/40"
    : `border-gold/10 ${hasHover ? "group-hover:border-gold/25" : ""}`;

  const flourishColor = isStatic
    ? "text-gold/50"
    : selected
    ? "text-gold"
    : "text-gold/30";

  const flourishHover = isStatic || selected || !hasHover
    ? ""
    : "group-hover:text-gold/60";

  const outerRadius = openBottom ? "rounded-t-lg" : "rounded-lg";
  const innerRadius = openBottom ? "rounded-t-md" : "rounded-md";

  return (
    <div className={`relative p-[6px] ${openBottom ? "pb-0" : ""} ${className ?? "h-full"}`}>
      {/* Outer border */}
      <div className={`absolute inset-0 ${outerRadius} border ${openBottom ? "border-b-0" : ""} ${outerBorder} transition-colors`} />
      {/* Inner border */}
      <div className={`absolute inset-[3px] ${openBottom ? "bottom-0" : ""} ${innerRadius} border ${openBottom ? "border-b-0" : ""} ${innerBorder} transition-colors`} />

      {/* Corner flourishes */}
      <CornerFlourish className={`absolute top-0 left-0 ${flourishColor} ${flourishHover} transition-colors`} />
      <CornerFlourish className={`absolute top-0 right-0 -scale-x-100 ${flourishColor} ${flourishHover} transition-colors`} />
      {!openBottom && (
        <>
          <CornerFlourish className={`absolute bottom-0 left-0 -scale-y-100 ${flourishColor} ${flourishHover} transition-colors`} />
          <CornerFlourish className={`absolute bottom-0 right-0 -scale-x-100 -scale-y-100 ${flourishColor} ${flourishHover} transition-colors`} />
        </>
      )}

      {/* Card content */}
      <div className={`relative ${innerRadius} overflow-hidden h-full flex flex-col ${
        selected ? "shadow-gold-glow" : ""
      } transition-shadow`}>
        {children}
      </div>
    </div>
  );
}
