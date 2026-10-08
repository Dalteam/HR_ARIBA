"""Roles and data scope. Every endpoint enforces these on the server; the UI only mirrors them.

- employee: own data only
- manager:  own data + direct reports (and approvals)
- finance:  payroll, payslips, end of service, settlement only
- hr:       all HR data
- ceo:      read access to HR data + final approvals
- admin:    everything, including role assignment
"""

from collections.abc import Callable

from fastapi import Depends
from sqlalchemy import Select, false, or_

from app.core.auth import get_current_user
from app.core.errors import forbidden
from app.models import Employee, Role, User

HR_ROLES = (Role.hr, Role.admin)
HR_READ_ROLES = (Role.hr, Role.ceo, Role.admin)
SALARY_ROLES = (Role.finance, Role.hr, Role.admin)


def require_roles(*roles: Role) -> Callable[..., User]:
    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise forbidden()
        return user

    return dependency


def scope_employees(stmt: Select, user: User) -> Select:
    """Restrict an Employee query to the rows this user may see. Out-of-scope rows simply don't
    exist for the caller, so a lookup by id returns 404 rather than 403."""
    if user.role in HR_READ_ROLES:
        return stmt
    if user.role == Role.manager and user.employee_id:
        return stmt.where(or_(Employee.id == user.employee_id, Employee.manager_id == user.employee_id))
    if user.role in (Role.employee, Role.manager) and user.employee_id:
        return stmt.where(Employee.id == user.employee_id)
    return stmt.where(false())


def can_view_salary(user: User, employee: Employee) -> bool:
    return user.role in SALARY_ROLES or (user.employee_id is not None and user.employee_id == employee.id)


def can_view_full_ids(user: User, employee: Employee) -> bool:
    return user.role in HR_ROLES or (user.employee_id is not None and user.employee_id == employee.id)
