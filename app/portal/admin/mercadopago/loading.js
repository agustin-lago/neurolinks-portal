import PortalPageWrapper from "@/components/portal/layout/PortalPageWrapper";
import Skeleton from "@/components/ui/Skeleton";

export default function AdminMercadoPagoLoading() {
  return (
    <PortalPageWrapper className="items-center justify-center">
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Skeleton className="w-4 h-4 rounded-sm" />
            <Skeleton className="w-32 h-4 rounded-md" />
          </div>
          <Skeleton className="w-80 h-10 mx-auto mb-2 rounded-xl" />
          <Skeleton className="w-96 h-4 mx-auto rounded-md" />
        </div>

        {/* Status Indicator */}
        <div className="flex justify-center mb-8">
          <Skeleton className="w-64 h-10 rounded-full" />
        </div>

        {/* Linked Accounts Skeletons */}
        <div className="space-y-4 mb-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass-strong rounded-2xl border border-white/[0.05] p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="w-10 h-10 rounded-xl" />
                  <div>
                    <Skeleton className="w-40 h-5 mb-1.5 rounded-md" />
                    <Skeleton className="w-24 h-3 rounded-md" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="w-32 h-9 rounded-xl" />
                  <Skeleton className="w-10 h-10 rounded-xl" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Add Account Button */}
        <Skeleton className="w-full h-14 rounded-xl" />
      </div>
    </PortalPageWrapper>
  );
}
