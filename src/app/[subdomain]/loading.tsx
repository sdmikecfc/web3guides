import GuideFeedSkeleton from "@/components/GuideFeedSkeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Hero skeleton */}
      <div className="mb-10 space-y-4">
        <div className="skeleton h-5 w-36 rounded-full" />
        <div className="skeleton h-12 w-72 rounded-xl" />
        <div className="skeleton h-4 w-96 max-w-full rounded" />
      </div>

      {/* Filter bar skeleton */}
      <div className="mb-7 flex gap-2">
        {[80, 72, 92, 80].map((w, i) => (
          <div key={i} className={`skeleton h-7 rounded-full`} style={{ width: w }} />
        ))}
      </div>

      <GuideFeedSkeleton count={9} />
    </div>
  );
}
