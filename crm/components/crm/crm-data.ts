export type CrmView = "dashboard" | "clients" | "tasks" | "analytics";

export type CaseStatus =
  | "חדש"
  | "נוצר קשר"
  | "איסוף פרטים"
  | "מוכן לטיפול"
  | "בטיפול"
  | "בהמתנה"
  | "הושלם"
  | "נסגר ללא השלמה";

export type PaymentStatus = "שולם" | "לא שולם" | "החזר";

export type CaseActivity = {
  id: string;
  label: string;
  meta: string;
  tone: "message" | "call" | "system";
};

export type ClientCase = {
  id: string;
  referenceNo?: string;
  contactId?: string;
  ownerId?: string;
  flightAt?: string | null;
  createdAt?: string;
  stage?: string;
  waitingOn?: string | null;
  preferredChannel?: string;
  name: string;
  initials: string;
  phone: string;
  phoneLink: string;
  email: string;
  destination: string;
  /* Submitted on the public website form and carried across the bridge. Empty
     for cases opened by staff or through /request, which never collect them. */
  intakePlan?: string;
  intakeArrival?: string;
  contactLocale?: string;
  /* The full public-intake submission, including health information. Present
     only on cases that came from the website form, and never editable: it is a
     record of what the customer wrote. */
  intakePassport?: string;
  intakeAge?: string;
  intakeCondition?: string;
  intakeRxState?: string;
  intakeConsents?: string[];
  /* Object paths in the private intake bucket. Set only when the submission
     carried that file; the server signs one on demand. */
  submissionId?: string;
  selfieFile?: string;
  rxFile?: string;
  service: string;
  source: string;
  owner: string;
  status: CaseStatus;
  payment: PaymentStatus;
  flightDate: string;
  flightTime: string;
  remainingHours: number | null;
  remainingLabel: string;
  nextAction: string;
  nextActionDue: string;
  lastContact: string;
  readiness: number;
  activities: CaseActivity[];
};

export type CrmTask = {
  id: string;
  clientId: string;
  client: string;
  title: string;
  due: string;
  bucket: "באיחור" | "היום" | "בהמשך";
  completed: boolean;
  dueAt?: string;
};

export type CrmNotification = {
  id: string;
  clientId: string;
  title: string;
  detail: string;
  time: string;
  urgent?: boolean;
};

export const statusOptions: CaseStatus[] = [
  "חדש",
  "נוצר קשר",
  "איסוף פרטים",
  "מוכן לטיפול",
  "בטיפול",
  "בהמתנה",
  "הושלם",
  "נסגר ללא השלמה",
];

export const paymentOptions: PaymentStatus[] = ["שולם", "לא שולם", "החזר"];

export const initialClients: ClientCase[] = [
  {
    id: "GC-1048",
    name: "נועה ברק",
    initials: "נב",
    phone: "050-123-4567",
    phoneLink: "972501234567",
    email: "noa@example.com",
    destination: "אתונה",
    service: "ליווי לקראת הנסיעה",
    source: "וואטסאפ",
    owner: "רותם",
    status: "בטיפול",
    payment: "שולם",
    flightDate: "5 בספטמבר",
    flightTime: "08:45",
    remainingHours: 21,
    remainingLabel: "בעוד 21 שעות",
    nextAction: "לאשר שכל הפרטים הושלמו",
    nextActionDue: "היום · 14:30",
    lastContact: "לפני 18 דקות",
    readiness: 76,
    activities: [
      {
        id: "a1",
        label: "התקבלה השלמת פרטים",
        meta: "היום · 11:42",
        tone: "system",
      },
      {
        id: "a2",
        label: "נשלחה הודעת WhatsApp",
        meta: "היום · 10:08 · רותם",
        tone: "message",
      },
      {
        id: "a3",
        label: "בוצעה שיחת תיאום",
        meta: "אתמול · 17:20 · 6 דקות",
        tone: "call",
      },
    ],
  },
  {
    id: "GC-1042",
    name: "עומר לוי",
    initials: "על",
    phone: "052-234-5678",
    phoneLink: "972522345678",
    email: "omer@example.com",
    destination: "סלוניקי",
    /* The one demo case that came through the website bridge, so it is the one
       carrying what the visitor submitted on the public form. A case opened by
       staff or through /request has none of these, which is why the other
       fixtures leave them out rather than inventing values. */
    intakePlan: "VIP",
    intakeArrival: "5 בספטמבר",
    contactLocale: "עברית",
    /* Demo values only. Deliberately obvious as fixtures -- a plausible-looking
       passport number or health narrative in sample data is the kind of thing
       that ends up quoted somewhere as if it were real. */
    intakePassport: "00000000",
    intakeAge: "41",
    intakeRxState: "לא",
    intakeCondition:
      "נתוני דוגמה בלבד. כאן מופיע התיאור שהלקוח כתב בטופס, כלשונו, עם כפתור העתקה.",
    intakeConsents: [
      "גיל 18+",
      "תקנון ומדיניות פרטיות",
      "עיבוד מידע רפואי",
      "איסור הוצאה מיוון",
      "ההחלטה נתונה לרופא",
      "נכונות הפרטים",
      "הגבלת אחריות",
    ],
    submissionId: "demo-submission-0000",
    selfieFile: "submissions/demo-submission-0000/selfie.jpg",
    // No rxFile: this demo case has no prescription upload, so the button for
    // it is absent rather than present and broken.
    service: "ליווי לקראת הנסיעה",
    source: "האתר",
    owner: "רותם",
    status: "איסוף פרטים",
    payment: "לא שולם",
    flightDate: "7 בספטמבר",
    flightTime: "16:10",
    remainingHours: 76,
    remainingLabel: "בעוד 3 ימים",
    nextAction: "לבקש השלמת פרטים חסרים",
    nextActionDue: "היום · 16:00",
    lastContact: "לפני שעתיים",
    readiness: 42,
    activities: [
      {
        id: "b1",
        label: "נשלח קישור להשלמת פרטים",
        meta: "היום · 09:15 · רותם",
        tone: "message",
      },
      {
        id: "b2",
        label: "התיק שויך לרותם",
        meta: "אתמול · 18:04",
        tone: "system",
      },
    ],
  },
  {
    id: "GC-1039",
    name: "יעל כהן",
    initials: "יכ",
    phone: "054-345-6789",
    phoneLink: "972543456789",
    email: "yael@example.com",
    destination: "כרתים",
    service: "תרגום מסמך",
    source: "המלצה",
    owner: "דניאל",
    status: "מוכן לטיפול",
    payment: "שולם",
    flightDate: "10 בספטמבר",
    flightTime: "06:30",
    remainingHours: 139,
    remainingLabel: "בעוד 6 ימים",
    nextAction: "לשלוח הודעת סיכום לפני הטיסה",
    nextActionDue: "8 בספטמבר",
    lastContact: "אתמול",
    readiness: 100,
    activities: [
      {
        id: "c1",
        label: "התיק סומן כמוכן לטיסה",
        meta: "אתמול · 13:26 · דניאל",
        tone: "system",
      },
      {
        id: "c2",
        label: "נשלח סיכום ללקוחה",
        meta: "אתמול · 13:24",
        tone: "message",
      },
    ],
  },
  {
    id: "GC-1035",
    name: "רון מלכה",
    initials: "רמ",
    phone: "053-456-7890",
    phoneLink: "972534567890",
    email: "ron@example.com",
    destination: "אתונה",
    service: "ליווי לקראת הנסיעה",
    source: "אינסטגרם",
    owner: "דניאל",
    status: "חדש",
    payment: "לא שולם",
    flightDate: "16 בספטמבר",
    flightTime: "12:20",
    remainingHours: 289,
    remainingLabel: "בעוד 12 ימים",
    nextAction: "ליצור קשר ראשוני",
    nextActionDue: "היום · 12:30",
    lastContact: "טרם נוצר קשר",
    readiness: 18,
    activities: [
      {
        id: "d1",
        label: "ליד חדש התקבל מהקמפיין",
        meta: "היום · 10:54",
        tone: "system",
      },
    ],
  },
  {
    id: "GC-1031",
    name: "מאיה אזולאי",
    initials: "מא",
    phone: "050-567-8901",
    phoneLink: "972505678901",
    email: "maya@example.com",
    destination: "טרם נקבע",
    service: "בירור ראשוני",
    source: "וואטסאפ",
    owner: "רותם",
    status: "בטיפול",
    payment: "החזר",
    flightDate: "טרם נקבע",
    flightTime: "—",
    remainingHours: null,
    remainingLabel: "אין תאריך טיסה",
    nextAction: "לקבל תאריך טיסה משוער",
    nextActionDue: "מחר",
    lastContact: "לפני 3 שעות",
    readiness: 28,
    activities: [
      {
        id: "e1",
        label: "סוכם לחזור לאחר הזמנת הטיסה",
        meta: "היום · 08:20 · רותם",
        tone: "call",
      },
      {
        id: "e2",
        label: "סטטוס התשלום עודכן להחזר",
        meta: "31 באוגוסט · דניאל",
        tone: "system",
      },
    ],
  },
];

export const initialTasks: CrmTask[] = [
  {
    id: "t1",
    clientId: "GC-1048",
    client: "נועה ברק",
    title: "לאשר שכל הפרטים הושלמו",
    due: "11:30",
    bucket: "באיחור",
    completed: false,
  },
  {
    id: "t2",
    clientId: "GC-1035",
    client: "רון מלכה",
    title: "ליצור קשר ראשוני",
    due: "12:30",
    bucket: "היום",
    completed: false,
  },
  {
    id: "t3",
    clientId: "GC-1042",
    client: "עומר לוי",
    title: "לבקש השלמת פרטים",
    due: "16:00",
    bucket: "היום",
    completed: false,
  },
  {
    id: "t4",
    clientId: "GC-1031",
    client: "מאיה אזולאי",
    title: "לקבל תאריך טיסה משוער",
    due: "מחר",
    bucket: "בהמשך",
    completed: false,
  },
  {
    id: "t5",
    clientId: "GC-1039",
    client: "יעל כהן",
    title: "לשלוח סיכום לפני הטיסה",
    due: "8 בספטמבר",
    bucket: "בהמשך",
    completed: false,
  },
];

export const initialNotifications: CrmNotification[] = [
  {
    id: "n1",
    clientId: "GC-1048",
    title: "טיסה בעוד פחות מ־24 שעות",
    detail: "נועה ברק · עדיין נותרה משימה פתוחה",
    time: "לפני 4 דקות",
    urgent: true,
  },
  {
    id: "n2",
    clientId: "GC-1042",
    title: "ממתין להשלמת פרטים",
    detail: "עומר לוי · לא התקבל עדכון מאז הבוקר",
    time: "לפני 36 דקות",
  },
  {
    id: "n3",
    clientId: "GC-1035",
    title: "ליד חדש ללא מענה",
    detail: "רון מלכה · משימת יצירת קשר להיום",
    time: "לפני שעה",
  },
];

export const sourceBreakdown = [
  { label: "WhatsApp", value: 42, color: "teal" },
  { label: "האתר", value: 31, color: "ink" },
  { label: "המלצות", value: 18, color: "terracotta" },
  { label: "קמפיינים", value: 9, color: "sand" },
] as const;
