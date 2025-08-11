"use client";

import Link from "next/link";

type Step = 1 | 2 | 3;

export default function Stepper({ current }: { current: Step }) {
  const steps = [
    { id: 1, label: "Generate", href: "/generate" },
    { id: 2, label: "Edit", href: "/edit" },
    { id: 3, label: "Checkout", href: "#" },
  ] as const;

  return (
    <nav aria-label="Progress" className="mb-6">
      <ol className="flex items-center gap-6">
        {steps.map((s, i) => {
          const active = s.id === current;
          const done = s.id < current;
          return (
            <li key={s.id} className="flex items-center gap-2">
              <Link
                href={s.href}
                className={`grid h-8 w-8 place-items-center rounded-full text-sm font-semibold transition ${
                  active
                    ? "bg-black text-white"
                    : done
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-200 text-zinc-700"
                }`}
                aria-current={active ? "step" : undefined}
              >
                {s.id}
              </Link>
              <span
                className={`text-sm ${
                  active ? "text-zinc-900" : "text-zinc-500"
                }`}
              >
                {s.label}
              </span>
              {i < steps.length - 1 && (
                <span className="mx-3 hidden h-px w-8 bg-zinc-200 sm:block" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}