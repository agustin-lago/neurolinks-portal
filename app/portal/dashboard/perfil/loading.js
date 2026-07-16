import PortalPageWrapper from "@/components/portal/layout/PortalPageWrapper";
import Skeleton from "@/components/ui/Skeleton";

export default function PerfilLoading() {
  return (
    <PortalPageWrapper className="items-center justify-center">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-8">
          <Skeleton className="w-32 h-4 mx-auto mb-3 rounded-md" />
          <Skeleton className="w-64 h-10 mx-auto mb-2 rounded-xl" />
          <Skeleton className="w-80 h-4 mx-auto rounded-md" />
        </div>

        <div className="glass-strong rounded-2xl overflow-hidden border border-white/[0.05] p-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
            <div>
              <Skeleton className="w-32 h-3 mb-2 rounded-md" />
              <Skeleton className="w-full h-12 rounded-xl" />
            </div>
            <div>
              <Skeleton className="w-40 h-3 mb-2 rounded-md" />
              <Skeleton className="w-full h-12 rounded-xl" />
            </div>
            <div>
              <Skeleton className="w-36 h-3 mb-2 rounded-md" />
              <Skeleton className="w-full h-12 rounded-xl" />
            </div>
            <div>
              <Skeleton className="w-48 h-3 mb-2 rounded-md" />
              <Skeleton className="w-full h-12 rounded-xl" />
            </div>
          </div>

          <div className="h-px bg-white/[0.05] my-1" />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
            <div>
              <Skeleton className="w-40 h-3 mb-2 rounded-md" />
              <Skeleton className="w-full h-12 rounded-xl" />
            </div>
            <div>
              <Skeleton className="w-48 h-3 mb-2 rounded-md" />
              <Skeleton className="w-full h-12 rounded-xl" />
            </div>
          </div>

          <Skeleton className="w-full h-12 rounded-xl mt-6" />
        </div>
      </div>
    </PortalPageWrapper>
  );
}
