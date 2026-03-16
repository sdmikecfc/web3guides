export default function GuideFeedSkeleton({ count = 9 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col rounded-2xl glass overflow-hidden">
          <div className="skeleton h-[2px] w-full" />
          <div className="flex flex-1 flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
              <div className="skeleton h-5 w-20 rounded-full" />
              <div className="skeleton h-3 w-16 rounded" />
            </div>
            <div className="space-y-1.5">
              <div className="skeleton h-4 w-full rounded" />
              <div className="skeleton h-4 w-4/5 rounded" />
            </div>
            <div className="space-y-1.5 flex-1">
              <div className="skeleton h-3 w-full rounded" />
              <div className="skeleton h-3 w-full rounded" />
              <div className="skeleton h-3 w-3/5 rounded" />
            </div>
            <div className="flex gap-1.5">
              <div className="skeleton h-5 w-14 rounded-full" />
              <div className="skeleton h-5 w-12 rounded-full" />
              <div className="skeleton h-5 w-16 rounded-full" />
            </div>
            <div className="flex items-center justify-between pt-3 mt-auto border-t"
                 style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              <div className="skeleton h-3 w-16 rounded" />
              <div className="skeleton h-7 w-16 rounded-lg" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
