"use client";

import { useState, useTransition } from "react";

export function AdminInlineSelect({
  id,
  field,
  value,
  options,
  action,
}: {
  id: string;
  field: string;
  value: string;
  options: { value: string; label: string }[];
  action: (id: string, field: string, value: string) => Promise<void>;
}) {
  const [current, setCurrent] = useState(value);
  const [isPending, startTransition] = useTransition();

  return (
    <select
      value={current}
      disabled={isPending}
      onChange={(e) => {
        const next = e.target.value;
        setCurrent(next);
        startTransition(async () => {
          await action(id, field, next);
        });
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
