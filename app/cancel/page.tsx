// app/cancel/page.tsx
import Link from "next/link";

export default function CancelPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-amber-100 text-amber-700">
            !
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Payment cancelled</h1>
            <p className="text-sm text-zinc-600">
              No charge was made. Your design and selections are still available.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link href="/edit" className="rounded-lg border px-4 py-2 text-sm hover:bg-zinc-50">
            Back to editor
          </Link>
          <Link
            href="/generate"
            className="rounded-lg border px-4 py-2 text-sm hover:bg-zinc-50"
          >
            Start a new design
          </Link>
        </div>
      </div>
    </div>
  );
}