# Ariba HR — أريبا للموارد البشرية

نظام الموارد البشرية لشركة أريبا: **موقع للموارد البشرية** + **تطبيق جوال للموظف** (iPhone و Android)، على خادم واحد.

|## التشغيل محلياً

### المتطلبات
- Python 3.12 · Node 22 أو أحدث · PostgreSQL 16+
- **قاعدة بيانات محلية فيها السكيما المُطبَّعة.** التطبيق لا ينشئ الجداول ولا يشغّل Alembic. طبّق ملفات `docs/db-normalization/` على نسخة محلية من البيانات (انظر `docs/db-normalization/README.md`).
- ⚠️ **لا توجّه أي ملف `.env` إلى قاعدة Railway.** كل التجارب على قاعدة محلية فقط.

### macOS / Linux
```bash
# الخادم  → http://localhost:8000
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env     # عدّل DATABASE_URL إلى قاعدتك المحلية
export RUN_MIGRATIONS_ON_STARTUP=false ENV=development
export CORS_ORIGINS="http://localhost:3000,http://localhost:8081"
uvicorn app.main:app --reload --port 8000

# موقع HR → http://localhost:3000   (نافذة ثانية)
cd frontend/hr-web
npm ci
echo 'NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1' > .env.local
npm run dev

# تطبيق الموظف → http://localhost:8081   (نافذة ثالثة)
cd frontend/employee-app
npm ci
EXPO_PUBLIC_API_URL=http://localhost:8000 npx expo start --web --port 8081 --clear
```

### Windows (PowerShell)
```powershell
# إن ظهر خطأ "running scripts is disabled" نفّذ مرة في كل نافذة:
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

# الخادم  → http://localhost:8000
cd backend
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env     # عدّل DATABASE_URL إلى قاعدتك المحلية
$env:RUN_MIGRATIONS_ON_STARTUP = "false"; $env:ENV = "development"
$env:CORS_ORIGINS = "http://localhost:3000,http://localhost:8081"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000

# موقع HR → http://localhost:3000   (نافذة ثانية)
cd frontend\hr-web
npm.cmd ci
Set-Content .env.local "NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1"
npm.cmd run dev

# تطبيق الموظف → http://localhost:8081   (نافذة ثالثة)
cd frontend\employee-app
npm.cmd ci
$env:EXPO_PUBLIC_API_URL = "http://localhost:8000"
npx.cmd expo start --web --port 8081 --clear
```

### على الجوال
ضع في `EXPO_PUBLIC_API_URL` عنوان IP جهازك (مثل `http://192.168.1.10:8000`) بدل `localhost`، وشغّل الخادم بـ `--host 0.0.0.0`. الجوال والجهاز على نفس الشبكة.

### أخطاء شائعة
- **الصفحة تعرض Method Not Allowed:** افتحت رابط الخادم في المتصفح. افتح الموقع على 3000.
- **تسجيل الدخول يفشل بخطأ شبكة:** تأكد أن `CORS_ORIGINS` يحتوي عنوان الصفحة بالضبط.
- **التطبيق يسجّل دخول على الإنتاج:** احذف `frontend/employee-app/.env` وافتح تبويب Network للتأكد أن الطلب يذهب إلى `localhost`.