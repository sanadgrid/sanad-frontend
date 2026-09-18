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
  components/ مكونات واجهة مشتركة بين المزايا (Logo, Icon) — بدون بيانات
  services/   الوصول للبيانات — المكان الوحيد اللي يكلم Firestore
  lib/        تهيئة البنية التحتية (firebase.ts)
```

- نصوص وأرقام الصفحة الرئيسية كلها في `src/features/home/content.ts` — عدّلها هناك بدون لمس التصميم.
- ألوان وخطوط الهوية في `src/index.css`، وملفات اللوقو الجاهزة في `public/brand/`.
- صورة المشاركة (واتساب وغيره) هي `public/og-image.jpg` ووسومها في `index.html`. الرابط الكامل ينحقن وقت البناء من متغير `URL` حق Netlify (شوف `vite.config.ts`). المعاينة ما تظهر إلا والموقع Public.
- المكونات في `features/` ما تستدعي Firestore مباشرة؛ تنادي دوال من `services/`.
- أي collection جديدة = ملف في `services/` هنا + قاعدة في `firestore.rules` في ريبو الباك اند.
- مفاتيح الـ AI أو أي سر ما تنحط هنا أبداً — كل شي في الفرونت مكشوف للمتصفح. استدعاءات الـ LLM تمر عبر Cloud Function في ريبو الباك اند.

## لوحة قدرة استعادة الخدمة — `/restoration`

لوحة تخطيط تشغيلي: لكل محطة تحسب كم من حملها تقدر المحطات المجاورة تشيله عبر نقاط الربط المفتوحة عادةً لو فُقدت المحطة بالكامل (N-1)، حسب الشهر والسيناريو.

- الكود كله في `src/features/restoration/`. الصفحة تنحمّل عند الطلب (`React.lazy` في `src/app/App.tsx`) عشان Leaflet وFirestore ما يثقّلون الصفحة الرئيسية.
- **محرك الحساب** في `engine.ts` — دوال صافية بدون I/O، تشتغل في المتصفح أو في Cloud Function بدون تغيير. **نموذج البيانات** في `types.ts` ويطابق مستندات Firestore (شوف `docs/data-model.md` في ريبو الباك اند).
- **البيانات التجريبية** في `demoData.ts`: شبكة مصطنعة للقطاع الأوسط (رموز المحطات والأحمال والسعات ونقاط الربط كلها مختلقة، والحقيقي فقط أسماء الأحياء ومواقعها التقريبية). تظهر تلقائياً لو Firebase مو مهيأ، أو فشلت القراءة، أو القطاع ما له مستند — والشارة فوق تبيّن المصدر.
- القراءة والكتابة في `src/services/restoration.ts` و`src/services/auth.ts` فقط. الزائر بدون تسجيل دخول يقرأ المستندات اللي `visibility: 'public'` لا غير.
- خريطة الأساس OpenStreetMap معتّمة بـ CSS. لو عندك مفتاح لمزوّد خرائط داكنة حط رابطه في `VITE_MAP_TILE_URL` (شوف `.env.example`).

> **البيانات الفعلية ما تنحط في هذا الريبو أبداً** — الريبو عام وكل شي فيه مكشوف. البيانات الفعلية تنرفع على Firestore فقط، من مشرف مسجّل دخوله (له مستند في `admins/{uid}`)، وبـ `visibility: 'restricted'` عشان ما يقرأها إلا أعضاء القطاع. زر «رفع البيانات التجريبية» في اللوحة يرفع الشبكة المصطنعة فقط.

### استيراد طبقات الخريطة (KMZ / KML)

المشرف فقط يشوف زر «استيراد طبقات الخريطة» في الشريط العلوي:

1. يختار ملف Google Earth (`.kmz` أو `.kml`) من جهازه. الملف ينقرأ **داخل المتصفح** (`src/features/restoration/import/` — دوال صافية بدون Firebase) وما يمر على أي سيرفر.
2. تطلع معاينة: كل مجلد في الملف = طبقة، مع عدد النقاط والخطوط والمناطق. جولة Google Earth الافتراضية والطبقات البعيدة عن القطاع تجي بدون تحديد.
3. «استيراد» يكتب الطبقات المحددة على Firestore مباشرة (`src/services/mapLayers.ts`): وصف الطبقة في `mapLayers` وعناصرها مقسّمة في `mapLayerChunks` (كل جزء أقل من 700KB)، ودائماً بـ `visibility: 'restricted'`. استيراد نفس المجلد مرة ثانية يستبدل الطبقة.
4. الطبقات تظهر في «طبقات الخريطة ← طبقات مستوردة» لأعضاء القطاع فقط، وعناصر الطبقة ما تنحمّل إلا لما تتفعّل. الزائر أو غير العضو ما يشوف شي.

> **ملفات المصدر (KMZ/KML) ما تدخل الريبو أبداً** — لا في `public/` ولا `src/` ولا الاختبارات ولا كأمثلة، ولا أي شي مشتق منها (أسماء، إحداثيات، أوصاف). أي تجربة على ملف حقيقي تكون خارج مجلد المشروع.

- رصيد خريطة الأساس (© OpenStreetMap) شرط من شروط استخدام البلاطات: يبقى ظاهراً وبرابطه، ونصّه في `mapTiles.ts`.

## الأوامر

| الأمر | وظيفته |
| --- | --- |
| `npm run dev` | سيرفر تطوير |
| `npm run build` | فحص الأنواع + بناء الإنتاج |
| `npm run lint` | فحص الكود |
