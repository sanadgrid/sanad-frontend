import type { IconName } from '../../components/Icon'

// Everything the landing page says. Every claim here is something the product
// does today; every figure shown on the page is synthetic and labelled as such.

// \u2066…\u2069 (LRI/PDI) keep a Latin run in reading order inside an Arabic sentence.
const ltr = (text: string) => `\u2066${text}\u2069`

export const ILLUSTRATIVE = 'بيانات توضيحية'

export const navLinks = [
  { href: '#problem', label: 'التحدي' },
  { href: '#how', label: 'كيف يعمل' },
  { href: '#capabilities', label: 'القدرات' },
  { href: '#proof', label: 'جرّب بنفسك' },
  { href: '#console', label: 'الواجهة' },
  { href: '#audiences', label: 'لمن' },
]

export const cta = {
  primary: { href: '#contact', label: 'اطلب عرضاً توضيحياً' },
  secondary: { href: '#how', label: 'شاهد كيف يعمل' },
  nav: 'تواصل معنا',
}

// The one way into the private side. The label says what it is and nothing more.
export const signIn = { href: '/restoration', label: 'تسجيل الدخول', footerLabel: 'دخول المصرّح لهم' }

export const hero = {
  kicker: 'DISTRIBUTION RESTORATION PLANNING',
  titleLead: 'لو فُقدت محطة في ذروة الصيف،',
  titleAccent: 'كم من حملها تستعيده الشبكة؟',
  lead: `سند منصة لتخطيط وتشغيل شبكات توزيع الكهرباء بجهدي ${ltr('13.8 kV')} و${ltr('33 kV')}. تحسب لكل محطة ولكل مغذٍّ كم من الحمل يمكن استعادته عبر نقاط الربط المفتوحة، ومن أي مسار، وبأي سرعة، ومن يبقى بلا تغذية — قبل أن يقع الحدث، لا بعده.`,
  facts: [
    { key: '13.8 · 33 kV', label: 'محطات ومغذيات ونقاط ربط مفتوحة' },
    { key: 'N-1', label: 'لكل محطة ولكل مجموعة محولات' },
    { key: 'A · MVA', label: 'بلغة المشغّل وبلغة المخطِّط' },
  ],
}

export const questions = [
  { title: 'كم يُستعاد؟', text: 'نسبة الحمل المستعاد، والحمل غير المستعاد بالميغاواط.' },
  { title: 'عبر أي ربط؟', text: 'كل نقل باسم خط الربط الذي يحمله والعامل الذي حدّه.' },
  { title: 'بأي سرعة؟', text: 'المناورة بالتحكم عن بُعد أولاً، ثم اليدوية الميدانية.' },
  { title: 'من يبقى بلا تغذية؟', text: 'المشتركون المعرضون للانقطاع والمواقع الحساسة خلفهم.' },
]

export const problem = {
  kicker: 'THE GAP',
  title: 'السؤال بسيط. الإجابة عنه بالجداول ليست كذلك.',
  sub: 'حين تُحسب قدرة الاستعادة يدوياً في جداول متفرقة، تتسلل أربع ثغرات إلى القرار — ولا تظهر إلا يوم الحدث.',
  items: [
    {
      icon: 'copy',
      title: 'جداول متفرقة',
      text: 'لكل إدارة ملفها ونسختها، فتختلف الأرقام باختلاف من يُسأل.',
    },
    {
      icon: 'thermometer',
      title: 'سعة واحدة طوال السنة',
      text: `القاطع المقنَّن على ${ltr('400 A')} لا يحمل ${ltr('400 A')} في ظهيرة أغسطس. الجدول ذو السعة الثابتة يَعِد بما لا تستطيعه الشبكة صيفاً.`,
    },
    {
      icon: 'eyeOff',
      title: 'لا رؤية جغرافية',
      text: 'الأرقام في صفوف والشبكة على الأرض؛ فلا يظهر أين تتجمع نقاط الضعف ولا أي المواقع الحساسة يقع خلفها.',
    },
    {
      icon: 'layers',
      title: 'الهامش يُحسب مرتين',
      text: 'حين تستقبل المحطة نفسها من أكثر من ربط، يُحتسب هامشها في كل صف على حدة — فيبدو المتاح أكبر مما هو.',
    },
  ] satisfies { icon: IconName; title: string; text: string }[],
}

export const how = {
  kicker: 'HOW IT WORKS',
  title: 'من بيانات الشبكة إلى قرار، في ثلاث خطوات.',
  steps: [
    {
      icon: 'database',
      title: 'بيانات الشبكة',
      text: 'المحطات والمحولات والمغذيات ونقاط الربط المفتوحة وأحمال الذروة، ومعها طبقاتك الجغرافية.',
      points: ['محطات ومحولات', 'مغذيات ونقاط ربط', 'أحمال الذروة الشهرية'],
    },
    {
      icon: 'cpu',
      title: 'محرك مقيَّد بقيود الشبكة',
      text: 'كل نقل حمل يُحدّ بأضيق ثلاثة قيود. تُخفَّض السعات حرارياً بحسب الشهر، وتُستنفد المناورات عن بُعد قبل اليدوية.',
      points: ['سعة خط الربط', 'هامش المغذي المستقبِل', `السعة المؤكدة ${ltr('(N-1)')} للمحطة المستقبِلة`],
    },
    {
      icon: 'target',
      title: 'قرار',
      text: 'خريطة ملوّنة بقدرة الاستعادة، وقائمة أولويات للتعزيز، وخطة تغذية بديلة لكل عنصر.',
      points: ['أين الخطر', 'ماذا نعزّز أولاً', 'من نغذّي ومن أين'],
    },
  ] satisfies { icon: IconName; title: string; text: string; points: string[] }[],
}

export const capabilities = {
  kicker: 'CAPABILITIES',
  title: 'ما الذي تفعله المنصة اليوم.',
  sub: 'ست قدرات مبنية وتعمل. لا وعود مؤجلة في هذه القائمة.',
  lead: [
    {
      icon: 'gauge',
      title: 'محرك قدرة الاستعادة',
      text: `لكل محطة: الحمل المستعاد عن بُعد ثم يدوياً، والحمل غير المستعاد بالميغاواط، والمشتركون المعرضون للانقطاع، وتحقق ${ltr('N-1')} للمحطة ولكل مجموعة محولات — مع تسمية العامل الذي حدّ كل نقل.`,
      visual: 'limits',
    },
    {
      icon: 'table',
      title: 'مستوى المحطة ومستوى المغذي',
      text: `«لو فُقد هذا المغذي؟» بالأمبير وبالـ${ltr('MVA')}، بطريقة الجدول التي يعمل بها المخططون اليوم — ومُعايَر عليها خليةً بخلية.`,
      visual: 'units',
    },
  ] satisfies { icon: IconName; title: string; text: string; visual: 'limits' | 'units' }[],
  rest: [
    {
      icon: 'route',
      title: 'خطط التغذية البديلة',
      text: 'عنصر رئيسي وبدائله بالترتيب، والأمبيرات المنقولة عبر كل ربط، ومقارنة قبل الخفض الحراري وبعده.',
    },
    {
      icon: 'map',
      title: 'الخريطة أولاً',
      text: 'محطات ملوّنة بقدرة الاستعادة، وخطوط الربط، وعلامات المشتركين الحساسين وكبار المشتركين.',
    },
    {
      icon: 'trending',
      title: 'أولويات التعزيز',
      text: `جدول يرتّب أضعف المحطات، وسيناريوهات موسمية وذروة، وتصدير ${ltr('CSV')} لما تراه.`,
    },
    {
      icon: 'pin',
      title: 'السياق الجغرافي',
      text: `استيراد طبقات ${ltr('Google Earth')} من المتصفح: نطاقات ومشاريع ومواقع محطات، وبحث برقم المحطة.`,
    },
  ] satisfies { icon: IconName; title: string; text: string }[],
  limits: ['سعة خط الربط', 'هامش المغذي المستقبِل', 'السعة المؤكدة للمحطة'],
  binding: 'العامل المحدِّد',
}

export const proof = {
  kicker: 'LIVE PROOF',
  title: 'افتراض واحد يحرّك الصورة كلها.',
  sub: 'ثلاثون مغذياً، لكل منها بديلان. حرّك السعة المفترضة للمغذي من سعة القاطع إلى حدّ التخطيط، وشاهد ما يحدث لقدرة الاستعادة. الحساب يجري أمامك بالمحرك نفسه الذي تعمل به المنصة.',
  ratingLabel: 'السعة المفترضة للمغذي',
  restored: 'يُستعاد من الحمل',
  unrestored: 'حمل غير مستعاد',
  split: 'توزيع المغذيات الثلاثين',
  methodTitle: 'كيف يُحسب؟',
  method: 'هامش كل بديل = السعة المفترضة − حمله الحالي. يُوزَّع حمل المغذي المفقود على بدائله بالترتيب، وما زاد على هوامشها يبقى غير مستعاد.',
  sectors: ['القطاع أ', 'القطاع ب', 'القطاع ج'],
  stops: [
    { ratingA: 400, label: 'سعة القاطع', hint: 'كما في الجدول الثابت' },
    { ratingA: 348, label: 'صيف', hint: `خفض حراري ${ltr('× 0.87')}` },
    { ratingA: 320, label: 'حد تخطيطي', hint: `${ltr('80%')} من سعة القاطع` },
  ],
  note: `مجموعة اصطناعية من 30 مغذياً على ${ltr('13.8 kV')}، بإجمالي حمل ${ltr('8,755 A')}. لا تمثل شبكة حقيقية.`,
}

export const statusLabel = {
  full: 'استعادة كاملة',
  high: 'استعادة مرتفعة',
  limited: 'استعادة محدودة',
  none: 'لا استعادة',
} as const

export const consolePreview = {
  kicker: 'THE CONSOLE',
  title: 'الخريطة أولاً، والقرار بجانبها.',
  sub: 'معاينة مرسومة لواجهة المنصة. الواجهة الفعلية خاصة، ولا تُفتح إلا بصلاحية.',
  points: [
    { icon: 'map', text: 'محطات ملوّنة بقدرة الاستعادة وخطوط ربط تُظهر الضعيف منها' },
    { icon: 'list', text: 'جدول أولويات مرتّب بقدرة الاستعادة ثم بالحمل غير المستعاد' },
    { icon: 'sun', text: 'وضعان فاتح وداكن، وسيناريوهات موسمية بضغطة' },
  ] satisfies { icon: IconName; text: string }[],
  // Synthetic figures for the drawn preview; they match the map beside them.
  mock: {
    title: 'قدرة استعادة الخدمة',
    filters: ['القطاع أ', 'أغسطس', 'توقع الحمل الذروي'],
    kpis: [
      { label: 'قدرة استعادة الخدمة', value: '91', unit: '%' },
      { label: 'حمل غير مستعاد', value: '14.2', unit: 'MW' },
      { label: `تحقق ${ltr('N-1')}`, value: '6 / 7', unit: 'محطات' },
      { label: 'مشتركون معرضون', value: '2,140', unit: '' },
    ],
    station: {
      code: '7003',
      percent: 84,
      caption: 'من حمل المحطة يمكن للشبكة استعادته عند فقدها',
      facts: [
        { label: 'الحمل', value: '38.2 MVA' },
        { label: 'السعة المؤكدة', value: '40.0 MVA' },
      ],
      n1: 'محقق',
      risk: { label: 'مشتركون معرضون للانقطاع', customers: '610', sensitive: 'حساس واحد' },
      transfersTitle: 'النقل عبر خطوط الربط',
      stagesTitle: 'مراحل الاستعادة',
      stages: [
        { key: 'remote', label: 'عن بُعد', share: 61 },
        { key: 'manual', label: 'يدوي', share: 23 },
        { key: 'short', label: 'غير مستعاد', share: 16 },
      ],
      transfers: [
        { to: '7002', mva: '14.6', switching: 'عن بُعد', limit: 'سعة خط الربط' },
        { to: '7005', mva: '8.7', switching: 'عن بُعد', limit: 'سعة المغذي المستقبِل' },
        { to: '7001', mva: '8.8', switching: 'يدوي', limit: 'السعة المؤكدة' },
      ],
    },
    table: {
      title: 'أولويات التعزيز',
      columns: ['المحطة', 'قدرة الاستعادة', 'عن بُعد', 'مشتركون معرضون', 'حساسون'],
      rows: [
        { code: '7006', percent: 62, status: 'limited', remote: '38%', customers: '1,420', sensitive: '2' },
        { code: '7003', percent: 84, status: 'high', remote: '61%', customers: '610', sensitive: '1' },
        { code: '7004', percent: 93, status: 'high', remote: '93%', customers: '110', sensitive: '1' },
      ],
    },
  },
}

export const audiences = {
  kicker: 'WHO IT SERVES',
  title: 'سؤال واحد، وأربع إجابات بلغة كل فريق.',
  sub: `الحمل غير المستعاد وزمن استعادته هما ما يحرّك ${ltr('SAIDI')} والطاقة غير المزوَّدة. سند يضع الاثنين أمام كل فريق بما يحتاجه ليقرر.`,
  items: [
    {
      icon: 'activity',
      when: 'ساعة الحدث',
      team: 'مركز التحكم',
      outcome: 'يعرف قبل الحدث أي نقاط الربط تُغلق أولاً، وكم أمبيراً ينتقل عبر كل منها.',
    },
    {
      icon: 'sliders',
      when: 'قبل الصيف',
      team: 'التخطيط التشغيلي',
      outcome: `يدخل الصيف بقائمة المحطات التي لا تحقق ${ltr('N-1')} تحت الخفض الحراري، لا بمتوسطات سنوية.`,
    },
    {
      icon: 'trending',
      when: 'عند الميزانية',
      team: 'تخطيط الاستثمار',
      outcome: `يوجّه ريال التعزيز التالي إلى حيث يستعيد أكبر قدر من الـ${ltr('MVA')} غير المستعاد.`,
    },
    {
      icon: 'building',
      when: 'في كل مراجعة',
      team: 'الإدارة التنفيذية',
      outcome: 'صورة واحدة لجاهزية الذروة: أين الخطر، ومن خلفه من مستشفيات ومياه ومشتركين حساسين.',
    },
  ] satisfies { icon: IconName; when: string; team: string; outcome: string }[],
}

export const trust = {
  kicker: 'TRUST',
  title: 'بيانات الشبكة ليست للعرض.',
  sub: 'بُنيت المنصة على أن بيانات الشبكة الحقيقية أصل حساس، وأن الثقة في الرقم تبدأ من معرفة كيف حُسب.',
  items: [
    {
      icon: 'lock',
      title: 'بيانات حقيقية مقيّدة',
      text: 'وحدة التحكم خاصة وتتطلب تسجيل دخول. كل ما في هذه الصفحة بيانات توضيحية.',
    },
    {
      icon: 'users',
      title: 'صلاحيات بنطاق القطاع',
      text: 'لكل مستخدم دور ونطاق: يرى قطاعه، ويعدّل ما أُذن له به فقط.',
    },
    {
      icon: 'layers',
      title: 'يتوسع قطاعاً بعد قطاع',
      text: 'تعدد القطاعات في أساس التصميم: يبدأ بقطاع واحد ويمتد دون إعادة بناء.',
    },
    {
      icon: 'shield',
      title: 'منهجية معلنة ومُختبرة',
      text: 'الافتراضات وطريقة الحساب مكتوبة داخل المنصة، والمحرك مُعايَر باختبارات على مثال محلول.',
    },
  ] satisfies { icon: IconName; title: string; text: string }[],
}

export const contactIntro = {
  kicker: 'CONTACT',
  titleLead: 'لنبدأ من سؤالك',
  titleAccent: 'عن شبكتك.',
  text: 'للاستفسار عن المنصة أو طلب عرض توضيحي، تواصل مباشرة مع مسؤول دعم التحكم.',
  mail: 'راسلنا بالبريد',
  call: 'اتصل مباشرة',
}

export const contact = {
  initials: 'YA',
  name: 'Yasser A. Alghamdi',
  role: 'Div. Manager, Distribution Control Support',
  department: 'Control Support Division',
  phoneDisplay: '056 000 2843',
  phoneHref: 'tel:+966560002843',
  email: 'yaghamdi2@se.com.sa',
}

export const footer = {
  line: 'سند — السند الذي تتكئ عليه الشبكة حين تفقد أحد عناصرها.',
}
