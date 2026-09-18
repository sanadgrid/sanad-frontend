# sanad — Frontend

React + Vite + TypeScript، ينشر على Netlify تلقائياً مع كل `push` على `main`.

الباك اند (قواعد Firestore) في ريبو منفصل: [sanad-backend](https://github.com/sanadgrid/sanad-backend).

## التشغيل محلياً

```bash
npm install
cp .env.example .env.local   # ثم عبّي قيم Firebase
npm run dev
```

قيم Firebase من: Firebase Console ← ⚙ Project settings ← Your apps ← Web app ← SDK setup and configuration.

## ربط Netlify (مرة واحدة)

1. Netlify ← **Add new site** ← **Import an existing project** ← GitHub ← اختر `sanadgrid/sanad-frontend`.
2. إعدادات البناء تنقرأ تلقائياً من `netlify.toml` (الأمر `npm run build`، المجلد `dist`).
3. Site configuration ← **Environment variables** ← أضف متغيرات `VITE_FIREBASE_*` الستة الموجودة في `.env.example`.
4. Deploy. بعدها أي push على `main` ينشر تلقائياً، وأي Pull Request ياخذ رابط معاينة.
5. Firebase Console ← Authentication ← Settings ← **Authorized domains** ← أضف دومين Netlify.

> لو فشل البناء برسالة "secrets scanning" بسبب مفتاح يبدأ بـ `AIza`: مفتاح Firebase للويب عام بطبيعته (الحماية من قواعد Firestore). أضف في Netlify متغير `SECRETS_SCAN_SMART_DETECTION_OMIT_VALUES` وقيمته هي المفتاح.

## هيكلة الكود — طبقات

كل طبقة تستورد من اللي تحتها فقط، مو العكس:

```
src/
  app/        غلاف التطبيق: التوجيه والـ providers
  features/   شاشات ومزايا، كل ميزة في مجلدها (features/home, ...)
  services/   الوصول للبيانات — المكان الوحيد اللي يكلم Firestore
  lib/        تهيئة البنية التحتية (firebase.ts)
```

- المكونات في `features/` ما تستدعي Firestore مباشرة؛ تنادي دوال من `services/`.
- أي collection جديدة = ملف في `services/` هنا + قاعدة في `firestore.rules` في ريبو الباك اند.
- مفاتيح الـ AI أو أي سر ما تنحط هنا أبداً — كل شي في الفرونت مكشوف للمتصفح. استدعاءات الـ LLM تمر عبر Cloud Function في ريبو الباك اند.

## الأوامر

| الأمر | وظيفته |
| --- | --- |
| `npm run dev` | سيرفر تطوير |
| `npm run build` | فحص الأنواع + بناء الإنتاج |
| `npm run lint` | فحص الكود |
