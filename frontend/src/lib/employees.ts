import {
  fetchBlob,
  request,
  upload,
  type Dashboard,
  type Dependent,
  type DependentInput,
  type DocumentFile,
  type DocumentType,
  type SalaryPreview,
  type SalaryPreviewInput,
  type Employee,
  type EmployeeCounts,
  type EmployeeInput,
  type EmployeeListItem,
  type EmployeeTab,
  type Lookups,
  type Page,
  type TerminateInput,
  type Uuid,
} from "./api";

export interface EmployeeQuery {
  tab?: EmployeeTab;
  q?: string;
  workplace_id?: Uuid;
  department_id?: Uuid;
  page?: number;
  page_size?: number;
  sort?: string;
}

export const listEmployees = (query: EmployeeQuery = {}) =>
  request<Page<EmployeeListItem>>("/employees", { query: { ...query } });

export const employeeCounts = () => request<EmployeeCounts>("/employees/counts");

export const getEmployee = (id: Uuid) => request<Employee>(`/employees/${id}`);

export const createEmployee = (body: EmployeeInput) => request<Employee>("/employees", { method: "POST", body });

export const updateEmployee = (id: Uuid, body: EmployeeInput) =>
  request<Employee>(`/employees/${id}`, { method: "PATCH", body });

export const terminateEmployee = (id: Uuid, body: TerminateInput) =>
  request<Employee>(`/employees/${id}/terminate`, { method: "POST", body });

export const reactivateEmployee = (id: Uuid) => request<Employee>(`/employees/${id}/reactivate`, { method: "POST" });

export const myEmployee = () => request<Employee>("/me/employee");

export const getLookups = () => request<Lookups>("/settings/lookups");

export const getDashboard = () => request<Dashboard>("/dashboard");

export const salaryPreview = (body: SalaryPreviewInput) =>
  request<SalaryPreview>("/employees/salary-preview", { method: "POST", body });

// ---------------------------------------------------------------- photo & documents

export function uploadPhoto(employeeId: Uuid, file: File) {
  const form = new FormData();
  form.append("file", file);
  return upload<void>(`/employees/${employeeId}/photo`, form, "PUT");
}

export const photoBlob = (employeeId: Uuid) => fetchBlob(`/employees/${employeeId}/photo`);

export const listDocuments = (employeeId: Uuid) => request<DocumentFile[]>(`/employees/${employeeId}/documents`);

export function uploadDocument(employeeId: Uuid, type: DocumentType, file: File) {
  const form = new FormData();
  form.append("type", type);
  form.append("file", file);
  return upload<DocumentFile>(`/employees/${employeeId}/documents`, form);
}

export const documentBlob = (documentId: Uuid) => fetchBlob(`/documents/${documentId}/file`);

export const deleteDocument = (documentId: Uuid) => request<void>(`/documents/${documentId}`, { method: "DELETE" });

/** Open a protected file in a new tab. */
export async function openDocument(documentId: Uuid) {
  const url = URL.createObjectURL(await documentBlob(documentId));
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ---------------------------------------------------------------- dependents

export const listDependents = (employeeId: Uuid) => request<Dependent[]>(`/employees/${employeeId}/dependents`);

export const createDependent = (employeeId: Uuid, body: DependentInput) =>
  request<Dependent>(`/employees/${employeeId}/dependents`, { method: "POST", body });

export const updateDependent = (id: Uuid, body: DependentInput) =>
  request<Dependent>(`/dependents/${id}`, { method: "PATCH", body });

export const deleteDependent = (id: Uuid) => request<void>(`/dependents/${id}`, { method: "DELETE" });

export function uploadDependentDocument(dependentId: Uuid, file: File) {
  const form = new FormData();
  form.append("file", file);
  return upload<DocumentFile>(`/dependents/${dependentId}/documents`, form);
}
