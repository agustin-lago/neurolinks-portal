import PortalPageWrapper from "@/components/portal/layout/PortalPageWrapper";
import Skeleton from "@/components/ui/Skeleton";

export default function DashboardLoading() {
  return (
    <PortalPageWrapper>
      {/* Header and Add Button */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <Skeleton className="w-32 h-4 mb-2 rounded-md" />
          <Skeleton className="w-64 h-10 rounded-xl" />
        </div>
        <Skeleton className="w-full md:w-36 h-12 rounded-xl" />
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-strong rounded-2xl border border-white/[0.05] p-6 relative overflow-hidden">
            {/* Header of card */}
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-3">
                <Skeleton className="w-12 h-12 rounded-xl" />
                <div>
                  <Skeleton className="w-32 h-5 mb-2 rounded-md" />
                  <Skeleton className="w-20 h-4 rounded-md" />
                </div>
              </div>
              <Skeleton className="w-20 h-6 rounded-full" />
            </div>

            {/* Details area */}
            <div className="space-y-4 mb-6">
              <div className="flex justify-between items-center">
                <Skeleton className="w-24 h-3 rounded-md" />
                <Skeleton className="w-32 h-3 rounded-md" />
              </div>
              <div className="flex justify-between items-center">
                <Skeleton className="w-20 h-3 rounded-md" />
                <Skeleton className="w-28 h-3 rounded-md" />
              </div>
              <div className="flex justify-between items-center">
                <Skeleton className="w-28 h-3 rounded-md" />
                <Skeleton className="w-24 h-3 rounded-md" />
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <Skeleton className="flex-1 h-12 rounded-xl" />
              <Skeleton className="w-12 h-12 rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </PortalPageWrapper>
  );
}
