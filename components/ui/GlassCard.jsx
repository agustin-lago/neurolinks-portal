import clsx from "clsx";

export default function GlassCard({ children, className = "", hoverEffect = false, noPadding = false }) {
  return (
    <div
      className={clsx(
        "glass-strong rounded-2xl border transition-all duration-300 relative overflow-hidden",
        !noPadding && "p-6",
        hoverEffect
          ? "border-white/[0.05] hover:border-accent/40 bg-white/[0.04] hover:bg-white/[0.06] hover:shadow-[0_0_20px_rgba(0,153,255,0.06)]"
          : "border-white/[0.05] bg-white/[0.02] backdrop-blur-md shadow-2xl",
        className
      )}
    >
      {children}
    </div>
  );
}
