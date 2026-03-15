export default function GuideLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <div className="mb-8 flex items-center gap-2">
        <div className="skeleton h-4 w-16 rounded" />
        <span className="text-[#2a2a3e]">/</span>
        <div className="skeleton h-4 w-48 rounded" />
      </div>

      {/* Header */}
      <div className="mb-8 space-y-4">
        <div className="flex gap-3">
          <div className="skeleton h-5 w-24 rounded-full" />
          <div className="skeleton h-5 w-16 rounded" />
          <div className="skeleton h-5 w-20 rounded" />
        </div>
        <div className="skeleton h-10 w-full rounded-xl" />
        <div className="skeleton h-10 w-4/5 rounded-xl" />
        <div className="space-y-2">
          <div className="skeleton h-4 w-full rounded" />
          <div className="skeleton h-4 w-full rounded" />
          <div className="skeleton h-4 w-3/4 rounded" />
        </div>
      </div>

      {/* Tags */}
      <div className="mb-8 flex gap-2">
        {[60, 72, 56, 80].map((w, i) => (
          <div key={i} className="skeleton h-6 rounded-full" style={{ width: w }} />
        ))}
      </div>

      {/* Divider */}
      <div className="skeleton mb-10 h-px w-full rounded" />

      {/* CTA box */}
      <div className="skeleton mb-10 h-32 w-full rounded-2xl" />
    </div>
  );
}
