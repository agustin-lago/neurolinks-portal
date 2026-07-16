import clsx from "clsx";

export default function Skeleton({ className, rounded = "rounded-xl" }) {
  return (
    <div
      className={clsx(
        "bg-white/[0.04] border border-white/[0.05] animate-pulse overflow-hidden relative",
        rounded,
        className
      )}
    >
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.04] to-transparent animate-[shimmer_2s_infinite]" />
    </div>
  );
}
