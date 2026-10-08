# Ariba HR — أريبا للموارد البشرية

نظام الموارد البشرية لشركة أريبا: **موقع للموارد البشرية** + **تطبيق جوال للموظف** (iPhone و Android)، على خادم واحد.

| المجلد | التقنية | النشر |
|---|---|---|
| `backend/` | FastAPI · SQLAlchemy · Alembic · PostgreSQL | Railway |
| `frontend/hr-web/` | Next.js (React + TypeScript) — موقع الموارد البشرية | Railway |
| `frontend/employee-app/` | React Native + Expo (TypeScript) — تطبيق الموظف | App Store · Google Play |
| `frontend/legacy/` | النظام القديم V114 مفصولاً لملفات (CSS / JS / المعادلات) — **مرجع فقط** | — |
| `docs/` | التوثيق: المعادلات، سير الطلبات، التصميم، الأسئلة المفتوحة، النشر | — |

الخادم يملك كل البيانات والحسابات والصلاحيات (`/api/v1`). الموقع والتطبيق يعرضان فقط.

## التشغيل محلياً

```bash
# الخادم (Python 3.12)
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env && .venv/bin/uvicorn app.main:app --reload --port 8000

# موقع HR (Node 22)
cd frontend/hr-web && npm install && cp .env.example .env.local && npm run dev   # http://localhost:3000

# تطبيق الموظف
cd frontend/employee-app && npm install && cp .env.example .env && npx expo start
```

على الجوال: ضع في `EXPO_PUBLIC_API_URL` عنوان IP جهازك في الشبكة بدل `localhost`.

## اقرأ بعدها
- [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) — المنجز وغير المنجز
- [docs/ARIBA_HR_System_Documentation.md](docs/ARIBA_HR_System_Documentation.md) — مواصفات النظام القديم (القسم 4 = المعادلات)
- [docs/DEPLOY_RAILWAY.md](docs/DEPLOY_RAILWAY.md) — النشر

النسخة السابقة من هذا المستودع محفوظة في الوسم `archive/before-reset`.
