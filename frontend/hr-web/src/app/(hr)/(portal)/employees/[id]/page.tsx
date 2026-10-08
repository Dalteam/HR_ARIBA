"use client";

import { useParams } from "next/navigation";
import { EmployeeForm } from "@/components/hr/employee-form";
import { PageState } from "@/components/hr/not-built";
import { useAuth } from "@/lib/auth-context";
import { getEmployee, getLookups, listEmployees, updateEmployee } from "@/lib/employees";
import { useApi } from "@/lib/use-api";

export default function EmployeePage() {
  const { id } = useParams<{ id: string }>();
  const { hasRole } = useAuth();
  const canEdit = hasRole("hr", "admin");
  const emp = useApi(() => getEmployee(id), `emp:${id}`);
  const lookups = useApi(getLookups, "lookups");
  const managers = useApi(() => (canEdit ? listEmployees({ tab: "active", page_size: 100, sort: "name_ar" }) : Promise.resolve(null)), `managers:${canEdit}`);
  const ready = emp.data && lookups.data;
  return (
    <div className="pg on" id="pg-form">
      {!ready ? (
        <PageState loading={emp.loading || lookups.loading} error={emp.error?.message || lookups.error?.message} onRetry={emp.reload} />
      ) : (
        <EmployeeForm
          key={emp.data!.updated_at}
          employee={emp.data!}
          lookups={lookups.data!}
          managers={managers.data?.items ?? []}
          canEdit={canEdit}
          onSubmit={async (body) => emp.setData(await updateEmployee(id, body))}
        />
      )}
    </div>
  );
}
