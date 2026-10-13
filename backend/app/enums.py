"""Domain enums (pure Python). Kept apart from the database layer: the canonical schema stores these as text."""

import enum


class Role(str, enum.Enum):
    employee = "employee"
    manager = "manager"
    finance = "finance"
    hr = "hr"
    ceo = "ceo"
    admin = "admin"


class EmployeeCategory(str, enum.Enum):
    active = "active"
    tamheer = "tamheer"
    training = "training"
    consultant = "consultant"
    hourly = "hourly"


class WpsType(str, enum.Enum):
    wps = "wps"
    trainee = "trainee"
    tamheer = "tamheer"
    external = "external"
    consultant = "consultant"
    no_wps = "no_wps"
    remote = "remote"


class GosiSystem(str, enum.Enum):
    matching = "matching"  # "new" system in the prototype
    non_matching = "non_matching"  # "old" system
    non_saudi = "non_saudi"


class Currency(str, enum.Enum):
    SAR = "SAR"
    USD = "USD"
    EUR = "EUR"
    EGP = "EGP"


class PaymentMethod(str, enum.Enum):
    mudad = "mudad"
    bank_transfer = "bank_transfer"
    international_transfer = "international_transfer"
    cash = "cash"


class ContractNature(str, enum.Enum):
    fixed = "fixed"
    indefinite = "indefinite"


class Gender(str, enum.Enum):
    male = "male"
    female = "female"


class Religion(str, enum.Enum):
    muslim = "muslim"
    other = "other"


class MaritalStatus(str, enum.Enum):
    single = "single"
    married = "married"
    divorced = "divorced"
    widowed = "widowed"


class TerminationArticle(str, enum.Enum):
    art_84 = "art_84"  # end of contract / employer termination
    art_74 = "art_74"  # contract ended by agreement / term
    art_74_death = "art_74_death"  # 74(3) death or disability
    art_74_retirement = "art_74_retirement"  # 74(4) retirement age
    art_85 = "art_85"  # resignation (indefinite contract)
    art_75 = "art_75"  # resignation with notice
    art_77 = "art_77"  # termination without valid reason
    art_80 = "art_80"  # dismissal for cause
    art_53 = "art_53"  # termination during probation


class DependentRelation(str, enum.Enum):
    wife = "wife"
    husband = "husband"
    son = "son"
    daughter = "daughter"
    father = "father"
    mother = "mother"


class LocationType(str, enum.Enum):
    hq = "hq"
    project = "project"
    remote = "remote"


class AttendanceStatus(str, enum.Enum):
    present = "present"
    late = "late"
    absent = "absent"
    leave = "leave"
    remote = "remote"


class AttendanceSource(str, enum.Enum):
    app = "app"
    manual = "manual"


class RequestType(str, enum.Enum):
    annual = "annual"
    sick = "sick"
    emergency = "emergency"
    death = "death"
    marriage = "marriage"
    maternity = "maternity"
    paternity = "paternity"
    umrah = "umrah"
    hajj = "hajj"
    remote = "remote"
    permission = "permission"
    maternity_permission = "maternity_permission"
    early_leave = "early_leave"
    advance = "advance"
    mission = "mission"
    forgot_punch = "forgot_punch"
    overtime = "overtime"


class RequestStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    cancelled = "cancelled"


class WorkflowStage(str, enum.Enum):
    manager = "manager"
    hr = "hr"
    ceo = "ceo"
    completed = "completed"


class StepAction(str, enum.Enum):
    submitted = "submitted"
    approved = "approved"
    rejected = "rejected"
    override_approved = "override_approved"


class PunchKind(str, enum.Enum):
    check_in = "in"
    check_out = "out"
    both = "both"


class DocumentType(str, enum.Enum):
    iqama = "iqama"
    passport = "passport"
    insurance = "insurance"
    contract = "contract"
    graduation_certificate = "graduation_certificate"
    experience_certificate = "experience_certificate"
    gosi_certificate = "gosi_certificate"
    cv = "cv"
    national_address = "national_address"
    photo = "photo"
    letter = "letter"
    other = "other"


class ExclusionReason(str, enum.Enum):
    never_joined = "never_joined"
    engagement_ended = "engagement_ended"
    other = "other"
