import PortalPageWrapper from "@/components/portal/layout/PortalPageWrapper";
import Skeleton from "@/components/ui/Skeleton";

export default function PagoLoading() {
  return (
    <PortalPageWrapper className="items-center justify-center">
      <div className="w-full max-w-4xl">
        {/* Header Skeleton */}
        <div className="text-center mb-8">
          <Skeleton className="w-40 h-4 mx-auto mb-3 rounded-md" />
          <Skeleton className="w-80 h-10 mx-auto mb-2 rounded-xl" />
          <Skeleton className="w-96 h-4 mx-auto rounded-md" />
        </div>

        {/* Region Selector Skeleton */}
        <div className="flex justify-center mb-8">
          <Skeleton className="w-64 h-12 rounded-full" />
        </div>

        {/* Plan Cards Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {[1, 2].map((i) => (
            <div key={i} className="p-6 rounded-2xl border border-white/[0.08] bg-white/[0.01]">
              <div className="flex items-center justify-between mb-3">
                <Skeleton className="w-24 h-3 rounded-md" />
              </div>
              <Skeleton className="w-56 h-6 mb-2 rounded-md" />
              <Skeleton className="w-full h-8 mb-6 rounded-md" />
              
              <div className="flex items-baseline gap-2 mt-6">
                <Skeleton className="w-12 h-3 rounded-md" />
                <Skeleton className="w-32 h-8 rounded-md" />
                <Skeleton className="w-16 h-3 rounded-md" />
              </div>
            </div>
          ))}
        </div>

        {/* Detail Card Skeleton */}
        <div className="glass-strong rounded-2xl border border-white/[0.05] p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="flex-1">
              <Skeleton className="w-48 h-5 mb-3 rounded-md" />
              <Skeleton className="w-64 h-3 mb-2 rounded-md" />
              
              <div className="flex gap-2 mb-5">
                <Skeleton className="flex-1 h-10 rounded-xl" />
                <Skeleton className="flex-1 h-10 rounded-xl" />
                <Skeleton className="flex-1 h-10 rounded-xl" />
              </div>

              <div className="h-px bg-white/[0.06] my-4" />

              <Skeleton className="w-48 h-3 mb-3 rounded-md" />
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((j) => (
                  <div key={j} className="flex items-center gap-2">
                    <Skeleton className="w-4 h-4 rounded-full shrink-0" />
                    <Skeleton className="w-64 h-3 rounded-md" />
                  </div>
                ))}
              </div>
            </div>

            <div className="w-full md:w-56 p-5">
              <Skeleton className="w-32 h-3 mb-2 rounded-md" />
              <Skeleton className="w-full h-10 mb-6 rounded-md" />
              <Skeleton className="w-full h-12 rounded-xl" />
            </div>
          </div>
        </div>

        {/* Footer Link Skeleton */}
        <div className="flex justify-center mt-6">
          <Skeleton className="w-48 h-3 rounded-md" />
        </div>
      </div>
    </PortalPageWrapper>
  );
}
