"use client";

import { useRouter } from "next/navigation";
import { EmployeeForm } from "@/components/hr/employee-form";
import { PageState } from "@/components/hr/not-built";
import { createEmployee, getLookups, listEmployees } from "@/lib/employees";
import { useApi } from "@/lib/use-api";

export default function NewEmployeePage() {
  const router = useRouter();
  const lookups = useApi(getLookups, "lookups");
  const managers = useApi(() => listEmployees({ tab: "active", page_size: 100, sort: "name_ar" }), "managers");
  return (
    <div className="pg on" id="pg-form">
      {!lookups.data ? (
        <PageState loading={lookups.loading} error={lookups.error?.message} onRetry={lookups.reload} />
      ) : (
        <EmployeeForm
          lookups={lookups.data}
          managers={managers.data?.items ?? []}
          canEdit
          onSubmit={async (body) => {
            const e = await createEmployee(body);
            router.replace(`/employees/${e.id}`);
          }}
        />
      )}
    </div>
  );
}
