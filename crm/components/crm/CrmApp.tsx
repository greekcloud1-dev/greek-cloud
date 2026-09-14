"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  Circle,
  Clock3,
  FileCheck2,
  Inbox,
  LayoutDashboard,
  Mail,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Plane,
  PlaneTakeoff,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import styles from "@/app/crm/crm.module.css";
import {
  initialClients,
  paymentOptions,
  statusOptions,
  type CaseStatus,
  type ClientCase,
  type CrmTask,
  type CrmView,
  type PaymentStatus,
} from "./crm-data";
import { useCrmData } from "./use-crm-data";
import { CopyField } from "./CopyField";
import { IntakeFiles } from "./IntakeFiles";
import { signOutFromCrm } from "@/app/crm/auth/actions";
import {
  WHATSAPP_TEMPLATES,
  renderWhatsAppTemplate,
  type WhatsAppTemplateKey,
} from "@/lib/crm/whatsapp";
import {
  LEAD_SOURCE_OPTIONS,
  SERVICE_KIND_OPTIONS,
  WAITING_ON_OPTIONS,
} from "@/lib/crm/constants";

const navigation = [
  {
    id: "dashboard" as const,
    label: "מרכז בקרה",
    shortLabel: "בית",
    icon: LayoutDashboard,
  },
  {
    id: "clients" as const,
    label: "לקוחות ותיקים",
    shortLabel: "לקוחות",
    icon: UsersRound,
  },
  {
    id: "tasks" as const,
    label: "משימות",
    shortLabel: "משימות",
    icon: CheckCircle2,
  },
  {
    id: "analytics" as const,
    label: "דוחות",
    shortLabel: "דוחות",
    icon: BarChart3,
  },
];

const viewHeadings: Record<CrmView, { title: string; eyebrow: string }> = {
  dashboard: { title: "מרכז הבקרה שלך", eyebrow: "מרכז הבקרה" },
  clients: { title: "לקוחות ותיקים", eyebrow: "כל התיקים במקום אחד" },
  tasks: { title: "משימות", eyebrow: "מה צריך לקרות עכשיו" },
  analytics: { title: "דוחות", eyebrow: "תמונה תפעולית" },
};

const statusClass: Record<CaseStatus, string> = {
  חדש: styles.statusNew,
  "נוצר קשר": styles.statusActive,
  "איסוף פרטים": styles.statusWaiting,
  "מוכן לטיפול": styles.statusReady,
  בטיפול: styles.statusActive,
  בהמתנה: styles.statusWaiting,
  הושלם: styles.statusDone,
  "נסגר ללא השלמה": styles.statusDone,
};

const paymentClass: Record<PaymentStatus, string> = {
  שולם: styles.paymentPaid,
  "לא שולם": styles.paymentPending,
  החזר: styles.paymentRefund,
};

function classNames(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(" ");
}

function getWhatsappHref(client: ClientCase) {
  const firstName = client.name.split(" ")[0];
  const message = `היי ${firstName}, כאן GreekCloud. רצינו לעדכן לגבי התיק שלך לקראת הנסיעה ל${client.destination}.`;
  return `https://wa.me/${client.phoneLink}?text=${encodeURIComponent(message)}`;
}

function getUrgencyLabel(client: ClientCase) {
  if (client.remainingHours === null) return "ללא תאריך";
  if (client.remainingHours <= 0) return "מועד הטיסה עבר";
  if (client.remainingHours < 24) return "דחוף";
  if (client.remainingHours <= 72) return "קרוב";
  return "במעקב";
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("");
}

type CrmAppProps = {
  demo: boolean;
  user: {
    id: string;
    displayName: string;
    initials: string;
    email: string;
  } | null;
  integrations: { email: boolean; telegram: boolean; scheduled: boolean };
};

export function CrmApp({ demo, user, integrations }: CrmAppProps) {
  const [view, setView] = useState<CrmView>("dashboard");
  const {
    clients,
    setClients,
    tasks,
    setTasks,
    notifications,
    setNotifications,
    staff,
    stats,
    preferences,
    setPreferences,
    loading,
    busy,
    error,
    setError,
    refresh,
    mutate,
  } = useCrmData(demo);
  const [selectedClientId, setSelectedClientId] = useState(
    demo ? initialClients[0].id : "",
  );
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("הכול");
  const [isNotificationsOpen, setNotificationsOpen] = useState(false);
  const [isLeadModalOpen, setLeadModalOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [extraModal, setExtraModal] = useState<
    "task" | "flight" | "settings" | "contact" | "log" | null
  >(null);
  const [templateKey, setTemplateKey] =
    useState<WhatsAppTemplateKey>("first_contact");
  const [todayLabel, setTodayLabel] = useState("");
  const clientDetailRef = useRef<HTMLElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const selectedClient =
    clients.find((client) => client.id === selectedClientId) ?? clients[0];
  const closed = (client: ClientCase) =>
    client.status === "הושלם" || client.status === "נסגר ללא השלמה";
  const sourceBreakdown = Object.entries(
    clients.reduce<Record<string, number>>((counts, client) => {
      counts[client.source] = (counts[client.source] || 0) + 1;
      return counts;
    }, {}),
  ).map(([label, count], index) => ({
    label,
    value: Math.round((count / Math.max(1, clients.length)) * 100),
    color: ["teal", "ink", "terracotta", "sand"][index % 4],
  }));
  const completedCount = clients.filter(
    (client) => client.status === "הושלם",
  ).length;
  const completionRate = Math.round(
    (completedCount / Math.max(1, clients.length)) * 100,
  );

  const urgentClients = useMemo(
    () =>
      [...clients]
        .filter(
          (client) =>
            client.remainingHours !== null &&
            client.remainingHours > 0 &&
            client.remainingHours <= 72 &&
            !closed(client),
        )
        .sort(
          (a, b) =>
            (a.remainingHours ?? Infinity) - (b.remainingHours ?? Infinity),
        ),
    [clients],
  );

  const filteredClients = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("he");

    return [...clients]
      .filter((client) => {
        const matchesQuery =
          !normalizedQuery ||
          [
            client.name,
            client.phone,
            client.email,
            client.destination,
            // The case number a person can actually read: it is on the card and
            // in every notification link, so it is the first thing anyone types
            // into this box. client.id is the row UUID, which nothing displays;
            // it stayed searchable only because the demo fixtures use GC-style
            // ids for both, which hid the gap until real rows appeared.
            client.referenceNo,
            client.id,
            client.service,
          ]
            .join(" ")
            .toLocaleLowerCase("he")
            .includes(normalizedQuery);

        const matchesFilter =
          filter === "הכול" ||
          (filter === "דחוף" &&
            client.remainingHours !== null &&
            client.remainingHours > 0 &&
            client.remainingHours <= 72 &&
            !closed(client)) ||
          client.status === filter;

        return matchesQuery && matchesFilter;
      })
      .sort(
        (a, b) =>
          (a.remainingHours ?? Infinity) - (b.remainingHours ?? Infinity),
      );
  }, [clients, filter, query]);

  const openTaskCount = tasks.filter((task) => !task.completed).length;
  const overdueTaskCount = tasks.filter(
    (task) => !task.completed && task.bucket === "באיחור",
  ).length;

  useEffect(() => {
    setTodayLabel(
      new Intl.DateTimeFormat("he-IL", {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: "Asia/Jerusalem",
      }).format(new Date()),
    );
    const caseId = new URLSearchParams(window.location.search).get("case");
    if (caseId) {
      setSelectedClientId(caseId);
      setView("clients");
    }
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [view]);

  useEffect(() => {
    if (!isLeadModalOpen && !isNotificationsOpen && !extraModal) return;
    const prior = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => {
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
      dialog
        ?.querySelector<HTMLElement>("button, input, select, textarea, a[href]")
        ?.focus();
    }, 0);
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLeadModalOpen(false);
        setNotificationsOpen(false);
        setExtraModal(null);
      }
      if (event.key !== "Tab") return;
      const nodes = [
        ...(document
          .querySelector('[role="dialog"]')
          ?.querySelectorAll<HTMLElement>(
            "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]",
          ) ?? []),
      ];
      const first = nodes[0],
        last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = overflow;
      prior?.focus();
    };
  }, [isLeadModalOpen, isNotificationsOpen, extraModal]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!isLeadModalOpen) return;

    nameInputRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLeadModalOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isLeadModalOpen]);

  async function updateClient(id: string, patch: Partial<ClientCase>) {
    const result = await mutate({
      type: "update_case",
      id,
      ...patch,
      ...(patch.ownerId === "" ? { ownerId: null } : {}),
    });
    if (!result) return;
    if (demo)
      setClients((current) =>
        current.map((client) =>
          client.id === id ? { ...client, ...patch } : client,
        ),
      );
    setToast(demo ? "השינוי עודכן בהדגמה בלבד" : "התיק עודכן");
  }

  function selectClient(id: string, revealOnMobile = false) {
    setSelectedClientId(id);

    if (revealOnMobile && window.matchMedia("(max-width: 839px)").matches) {
      window.setTimeout(() => {
        clientDetailRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 60);
    }
  }

  function openClient(id: string) {
    setSelectedClientId(id);
    setView("clients");
    setNotificationsOpen(false);
    window.setTimeout(() => {
      if (window.matchMedia("(max-width: 839px)").matches) {
        clientDetailRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    }, 80);
  }

  async function toggleTask(id: string) {
    const task = tasks.find((item) => item.id === id);
    if (!task) return;
    const result = await mutate({
      type: "toggle_task",
      id,
      completed: !task.completed,
    });
    if (!result) return;
    if (demo)
      setTasks((current) =>
        current.map((task) =>
          task.id === id ? { ...task, completed: !task.completed } : task,
        ),
      );
    setToast(demo ? "המשימה עודכנה בהדגמה בלבד" : "המשימה עודכנה");
  }

  async function handleNewLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get("name") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const destination =
      String(formData.get("destination") ?? "").trim() || "טרם נקבע";
    const flightInput = String(formData.get("flightDate") ?? "");
    const source = String(formData.get("source") ?? "manual");
    const service = String(formData.get("service") ?? "other");

    if (!name || !phone) return;

    const flight = flightInput ? new Date(flightInput) : null;
    const result = await mutate({
      type: "create_case",
      fullName: name,
      phone,
      email: email || undefined,
      destination: destination === "טרם נקבע" ? undefined : destination,
      source,
      service,
      flightAt: flight?.toISOString() ?? null,
    });
    if (!result) return;
    if (!demo) {
      if (result.caseId) setSelectedClientId(result.caseId);
      setView("clients");
      setLeadModalOpen(false);
      setToast("הליד נשמר ונוצרה משימת חזרה");
      form.reset();
      return;
    }
    const remainingHours = flight
      ? Math.max(0, Math.round((flight.getTime() - Date.now()) / 3_600_000))
      : null;
    const flightDate = flight
      ? new Intl.DateTimeFormat("he-IL", {
          day: "numeric",
          month: "long",
        }).format(flight)
      : "טרם נקבע";
    const numericPhone = phone.replace(/\D/g, "").replace(/^0/, "972");
    const id = `GC-${1050 + clients.length}`;
    const newClient: ClientCase = {
      id,
      flightAt: flight?.toISOString() ?? null,
      name,
      initials: getInitials(name),
      phone,
      phoneLink: numericPhone,
      email: email || "לא הוזן",
      destination,
      service:
        SERVICE_KIND_OPTIONS.find((item) => item.value === service)?.label ??
        "אחר",
      source:
        LEAD_SOURCE_OPTIONS.find((item) => item.value === source)?.label ??
        "אחר",
      owner: "לא שויך",
      status: "חדש",
      payment: "לא שולם",
      flightDate,
      flightTime: flight
        ? new Intl.DateTimeFormat("he-IL", {
            hour: "2-digit",
            minute: "2-digit",
          }).format(flight)
        : "טרם נקבע",
      remainingHours,
      remainingLabel:
        remainingHours === null
          ? "אין תאריך טיסה"
          : `בעוד ${Math.max(1, Math.ceil(remainingHours / 24))} ימים`,
      nextAction: "ליצור קשר ראשוני",
      nextActionDue: "היום",
      lastContact: "טרם נוצר קשר",
      readiness: 10,
      activities: [
        {
          id: `${id}-activity`,
          label: "ליד חדש נוסף למערכת",
          meta: "עכשיו",
          tone: "system",
        },
      ],
    };

    setClients((current) => [newClient, ...current]);
    setTasks((current) => [
      {
        id: `${id}-task`,
        clientId: id,
        client: name,
        title: "ליצור קשר ראשוני",
        due: "היום",
        bucket: "היום",
        completed: false,
      },
      ...current,
    ]);
    setSelectedClientId(id);
    setView("clients");
    setLeadModalOpen(false);
    setToast("ליד לדוגמה נוסף — אינו נשמר לאחר רענון");
    form.reset();
  }

  async function saveOperationalNote() {
    if (!noteDraft.trim() || !selectedClient) return;
    const result = await mutate({
      type: "add_note",
      caseId: selectedClient.id,
      note: noteDraft.trim(),
    });
    if (!result) return;

    if (demo)
      setClients((current) =>
        current.map((client) =>
          client.id === selectedClient.id
            ? {
                ...client,
                activities: [
                  {
                    id: `${selectedClient.id}-${Date.now()}`,
                    label: noteDraft.trim(),
                    meta: "עכשיו · הדגמה",
                    tone: "system",
                  },
                  ...selectedClient.activities,
                ],
              }
            : client,
        ),
      );
    setNoteDraft("");
    setToast(demo ? "ההערה נוספה להדגמה בלבד" : "ההערה התפעולית נשמרה");
  }

  async function handleExtraForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (extraModal === "task") {
      const caseId = String(data.get("caseId"));
      const title = String(data.get("title")).trim();
      const dueAt = new Date(String(data.get("dueAt"))).toISOString();
      const result = await mutate({
        type: "create_task",
        caseId,
        title,
        dueAt,
      });
      if (!result) return;
      if (demo)
        setTasks((current) => [
          {
            id: crypto.randomUUID(),
            clientId: caseId,
            client: clients.find((client) => client.id === caseId)?.name || "",
            title,
            dueAt,
            due: new Intl.DateTimeFormat("he-IL", {
              day: "numeric",
              month: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date(dueAt)),
            bucket: new Date(dueAt) < new Date() ? "באיחור" : "בהמשך",
            completed: false,
          },
          ...current,
        ]);
    } else if (extraModal === "flight" && selectedClient) {
      const input = String(data.get("flightAt") || "");
      const date = input ? new Date(input) : null;
      const destination = String(data.get("destination") || "").trim();
      const result = await mutate({
        type: "update_case",
        id: selectedClient.id,
        flightAt: date?.toISOString() ?? null,
        destination,
      });
      if (!result) return;
      if (demo)
        setClients((current) =>
          current.map((client) =>
            client.id === selectedClient.id
              ? {
                  ...client,
                  destination: destination || "טרם נקבע",
                  flightAt: date?.toISOString() ?? null,
                  flightDate: date
                    ? new Intl.DateTimeFormat("he-IL", {
                        day: "numeric",
                        month: "long",
                      }).format(date)
                    : "טרם נקבע",
                  flightTime: date
                    ? new Intl.DateTimeFormat("he-IL", {
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(date)
                    : "—",
                  remainingHours: date
                    ? Math.ceil((date.getTime() - Date.now()) / 3_600_000)
                    : null,
                  remainingLabel: date
                    ? new Intl.RelativeTimeFormat("he", {
                        numeric: "auto",
                      }).format(
                        Math.ceil((date.getTime() - Date.now()) / 86_400_000),
                        "day",
                      )
                    : "אין תאריך טיסה",
                }
              : client,
          ),
        );
    } else if (extraModal === "contact" && selectedClient) {
      const fullName = String(data.get("fullName")).trim(),
        phone = String(data.get("phone")).trim(),
        email = String(data.get("email") || "").trim();
      const result = await mutate({
        type: "update_contact",
        contactId: selectedClient.contactId,
        fullName,
        phone,
        email,
      });
      if (!result) return;
      if (demo)
        setClients((current) =>
          current.map((client) =>
            client.phoneLink === selectedClient.phoneLink
              ? {
                  ...client,
                  name: fullName,
                  initials: getInitials(fullName),
                  phone,
                  phoneLink: phone.replace(/\D/g, "").replace(/^0/, "972"),
                  email,
                }
              : client,
          ),
        );
    } else if (extraModal === "log" && selectedClient) {
      const channel = String(data.get("channel"));
      const result = await mutate({
        type: "log_contact",
        caseId: selectedClient.id,
        channel,
      });
      if (!result) return;
      if (demo)
        setClients((current) =>
          current.map((client) =>
            client.id === selectedClient.id
              ? {
                  ...client,
                  lastContact: "נוצר קשר עכשיו",
                  activities: [
                    {
                      id: crypto.randomUUID(),
                      label: "תועדה יצירת קשר",
                      meta: "עכשיו · הדגמה",
                      tone: "call",
                    },
                    ...client.activities,
                  ],
                }
              : client,
          ),
        );
    }
    setExtraModal(null);
    setToast(demo ? "עודכן בהדגמה בלבד" : "השינויים נשמרו");
  }

  function localDateTime(iso?: string | null) {
    if (!iso) return "";
    const value = new Date(iso);
    return new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
  }

  function renderContactActions(client: ClientCase, compact = false) {
    return (
      <div
        className={classNames(
          styles.contactActions,
          compact && styles.contactActionsCompact,
        )}
      >
        <a
          className={styles.whatsappAction}
          href={demo ? undefined : getWhatsappHref(client)}
          aria-disabled={demo}
          onClick={
            demo
              ? () =>
                  setToast(
                    "נתוני דוגמה — אפשר לפתוח וואטסאפ לאחר חיבור לקוחות אמיתיים",
                  )
              : undefined
          }
          target="_blank"
          rel="noreferrer"
        >
          <MessageCircle aria-hidden="true" size={compact ? 17 : 19} />
          {!compact && <span>וואטסאפ</span>}
          <span className={styles.srOnly}>
            שליחת הודעת WhatsApp אל {client.name}
          </span>
        </a>
        <a
          className={styles.callAction}
          href={demo ? undefined : `tel:+${client.phoneLink}`}
          aria-disabled={demo}
        >
          <Phone aria-hidden="true" size={compact ? 17 : 19} />
          {!compact && <span>חיוג</span>}
          <span className={styles.srOnly}>חיוג אל {client.name}</span>
        </a>
      </div>
    );
  }

  function renderDashboard() {
    const nextFlight = [...clients]
      .filter(
        (client) =>
          client.remainingHours !== null &&
          client.remainingHours > 0 &&
          !closed(client),
      )
      .sort(
        (a, b) =>
          (a.remainingHours ?? Infinity) - (b.remainingHours ?? Infinity),
      )[0];

    return (
      <div className={styles.viewStack}>
        <section
          className={styles.pageIntro}
          aria-labelledby="dashboard-heading"
        >
          <div>
            <p>{viewHeadings.dashboard.eyebrow}</p>
            <h1 id="dashboard-heading">
              {user
                ? `שלום, ${user.displayName}`
                : viewHeadings.dashboard.title}
            </h1>
            <span>הנה מה שדורש תשומת לב היום.</span>
          </div>
          <button
            className={styles.primaryButton}
            type="button"
            onClick={() => setLeadModalOpen(true)}
          >
            <Plus aria-hidden="true" size={19} />
            ליד חדש
          </button>
        </section>

        <section className={styles.metricGrid} aria-label="סיכום פעילות">
          <article className={styles.metricCard}>
            <span className={styles.metricIcon}>
              <Inbox aria-hidden="true" size={18} />
            </span>
            <div>
              <strong>
                {clients.filter((client) => client.status === "חדש").length}
              </strong>
              <span>לידים חדשים</span>
            </div>
            <small>ממתינים ליצירת קשר</small>
          </article>
          <article className={styles.metricCard}>
            <span className={styles.metricIcon}>
              <UsersRound aria-hidden="true" size={18} />
            </span>
            <div>
              <strong>
                {clients.filter((client) => !closed(client)).length}
              </strong>
              <span>תיקים פתוחים</span>
            </div>
            <small>
              {clients.filter((client) => client.status === "בטיפול").length}{" "}
              בטיפול
            </small>
          </article>
          <article
            className={classNames(
              styles.metricCard,
              overdueTaskCount > 0 && styles.metricCardAlert,
            )}
          >
            <span className={styles.metricIcon}>
              <Clock3 aria-hidden="true" size={18} />
            </span>
            <div>
              <strong>{openTaskCount}</strong>
              <span>משימות פתוחות</span>
            </div>
            <small>{overdueTaskCount} באיחור</small>
          </article>
          <article className={styles.metricCard}>
            <span className={styles.metricIcon}>
              <FileCheck2 aria-hidden="true" size={18} />
            </span>
            <div>
              <strong>
                {clients.filter((client) => client.payment === "שולם").length}
              </strong>
              <span>סומנו כשולמו</span>
            </div>
            <small>סימון תפעולי בלבד</small>
          </article>
        </section>

        {nextFlight ? (
          <section
            className={styles.flightHorizon}
            aria-labelledby="next-flight-heading"
          >
            <div className={styles.flightHorizonGlow} aria-hidden="true" />
            <div className={styles.flightHorizonTop}>
              <div>
                <span className={styles.inverseEyebrow}>
                  <PlaneTakeoff aria-hidden="true" size={15} /> הטיסה הקרובה
                  ביותר
                </span>
                <h2 id="next-flight-heading">{nextFlight.name}</h2>
              </div>
              <span className={styles.caseCode}>
                {nextFlight.referenceNo ?? nextFlight.id}
              </span>
            </div>

            <div className={styles.flightHorizonBody}>
              <div className={styles.countdownBlock}>
                <span className={styles.countdownNumber}>
                  {nextFlight.remainingHours === null
                    ? "—"
                    : Math.ceil(nextFlight.remainingHours)}
                </span>
                <div>
                  <strong>שעות</strong>
                  <span>עד הטיסה</span>
                </div>
              </div>
              <div className={styles.departureMeta}>
                <span>
                  <MapPin aria-hidden="true" size={17} />{" "}
                  {nextFlight.destination}
                </span>
                <span>
                  <CalendarDays aria-hidden="true" size={17} />{" "}
                  {nextFlight.flightDate}
                </span>
                <span>
                  <Clock3 aria-hidden="true" size={17} />{" "}
                  {nextFlight.flightTime}
                </span>
              </div>
              <div className={styles.horizonAction}>
                <span>הפעולה הבאה</span>
                <strong>{nextFlight.nextAction}</strong>
                <button type="button" onClick={() => openClient(nextFlight.id)}>
                  לפתיחת התיק <ChevronLeft aria-hidden="true" size={17} />
                </button>
              </div>
            </div>

            <div
              className={styles.runway}
              aria-label={`${nextFlight.readiness}% מהמשימות הושלמו`}
            >
              <span className={styles.runwayOrigin}>נפתח תיק</span>
              <div className={styles.runwayLine}>
                <span style={{ width: `${nextFlight.readiness}%` }} />
                <Plane
                  className={styles.runwayPlane}
                  aria-hidden="true"
                  size={24}
                  style={{ right: `calc(${nextFlight.readiness}% - 12px)` }}
                />
              </div>
              <span className={styles.runwayDestination}>המראה</span>
            </div>
          </section>
        ) : (
          <section className={styles.emptyState}>
            <PlaneTakeoff aria-hidden="true" size={32} />
            <strong>אין טיסות קרובות</strong>
            <span>לאחר הוספת מועד טיסה לתיק, הספירה לאחור תופיע כאן.</span>
          </section>
        )}

        <div className={styles.dashboardColumns}>
          <section className={styles.panel} aria-labelledby="urgent-heading">
            <div className={styles.panelHeader}>
              <div>
                <span>לפי זמן עד הטיסה</span>
                <h2 id="urgent-heading">דורשים תשומת לב</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setView("clients");
                  setFilter("דחוף");
                }}
              >
                לכל התיקים <ChevronLeft aria-hidden="true" size={16} />
              </button>
            </div>
            <div className={styles.urgentList}>
              {urgentClients.map((client) => (
                <article className={styles.urgentRow} key={client.id}>
                  <button
                    className={styles.urgentRowMain}
                    type="button"
                    onClick={() => openClient(client.id)}
                  >
                    <span className={styles.avatar}>{client.initials}</span>
                    <span className={styles.urgentIdentity}>
                      <strong>{client.name}</strong>
                      <small>
                        {client.destination} · {client.flightDate}
                      </small>
                    </span>
                    <span
                      className={classNames(
                        styles.countdownPill,
                        (client.remainingHours ?? 100) < 24 &&
                          styles.countdownPillUrgent,
                      )}
                    >
                      {client.remainingLabel}
                    </span>
                  </button>
                  {renderContactActions(client, true)}
                </article>
              ))}
            </div>
          </section>

          <section className={styles.panel} aria-labelledby="today-heading">
            <div className={styles.panelHeader}>
              <div>
                <span>{openTaskCount} פתוחות</span>
                <h2 id="today-heading">משימות הצוות</h2>
              </div>
              <button type="button" onClick={() => setView("tasks")}>
                לכל המשימות <ChevronLeft aria-hidden="true" size={16} />
              </button>
            </div>
            <div className={styles.taskPreviewList}>
              {tasks
                .filter((task) => !task.completed)
                .slice(0, 4)
                .map((task) => (
                  <div className={styles.taskPreview} key={task.id}>
                    <button
                      type="button"
                      onClick={() => toggleTask(task.id)}
                      aria-label={`סימון המשימה ${task.title} כהושלמה`}
                    >
                      <Circle aria-hidden="true" size={21} />
                    </button>
                    <button
                      className={styles.taskPreviewCopy}
                      type="button"
                      onClick={() => openClient(task.clientId)}
                    >
                      <strong>{task.title}</strong>
                      <span>{task.client}</span>
                    </button>
                    <span
                      className={classNames(
                        styles.taskDue,
                        task.bucket === "באיחור" && styles.taskDueLate,
                      )}
                    >
                      {task.due}
                    </span>
                  </div>
                ))}
            </div>
          </section>
        </div>

        <div className={styles.dashboardColumnsSecondary}>
          <section className={styles.panel} aria-labelledby="source-heading">
            <div className={styles.panelHeader}>
              <div>
                <span>כל התיקים</span>
                <h2 id="source-heading">מאיפה מגיעים הלידים</h2>
              </div>
              <button type="button" onClick={() => setView("analytics")}>
                לדוח המלא <ChevronLeft aria-hidden="true" size={16} />
              </button>
            </div>
            <div className={styles.sourceStack}>
              <div
                className={styles.sourceBar}
                aria-label="התפלגות מקורות הלידים"
              >
                {sourceBreakdown.map((source) => (
                  <span
                    key={source.label}
                    className={styles[`source${source.color}`]}
                    style={{ width: `${source.value}%` }}
                  />
                ))}
              </div>
              <div className={styles.sourceLegend}>
                {sourceBreakdown.map((source) => (
                  <span key={source.label}>
                    <i className={styles[`source${source.color}`]} />{" "}
                    {source.label} <strong>{source.value}%</strong>
                  </span>
                ))}
              </div>
            </div>
          </section>

          <section className={styles.panel} aria-labelledby="activity-heading">
            <div className={styles.panelHeader}>
              <div>
                <span>{demo ? "נתוני דוגמה" : "מתרענן בכל דקה"}</span>
                <h2 id="activity-heading">פעילות אחרונה</h2>
              </div>
            </div>
            <div className={styles.compactActivity}>
              {clients
                .filter((client) => client.activities.length)
                .slice(0, 3)
                .map((client) => (
                  <button
                    type="button"
                    key={client.id}
                    onClick={() => openClient(client.id)}
                  >
                    <span
                      className={styles.activityDot}
                      data-tone={client.activities[0].tone}
                    />
                    <span>
                      <strong>{client.activities[0].label}</strong>
                      <small>
                        {client.name} · {client.activities[0].meta}
                      </small>
                    </span>
                    <ChevronLeft aria-hidden="true" size={16} />
                  </button>
                ))}
            </div>
          </section>
        </div>
      </div>
    );
  }

  function renderClients() {
    return (
      <div className={styles.viewStack}>
        <section className={styles.pageIntro} aria-labelledby="clients-heading">
          <div>
            <p>{viewHeadings.clients.eyebrow}</p>
            <h1 id="clients-heading">{viewHeadings.clients.title}</h1>
            <span>{clients.length} תיקים · מסודרים לפי מועד הטיסה</span>
          </div>
          <button
            className={styles.primaryButton}
            type="button"
            onClick={() => setLeadModalOpen(true)}
          >
            <UserPlus aria-hidden="true" size={19} /> ליד חדש
          </button>
        </section>

        <section
          className={styles.clientToolbar}
          aria-label="חיפוש וסינון תיקים"
        >
          <label className={styles.searchField}>
            <span className={styles.srOnly}>חיפוש לקוח או תיק</span>
            <Search aria-hidden="true" size={19} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="חיפוש לפי שם, טלפון או יעד"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="ניקוי החיפוש"
              >
                <X aria-hidden="true" size={17} />
              </button>
            )}
          </label>
          <label className={styles.filterField}>
            <SlidersHorizontal aria-hidden="true" size={18} />
            <span className={styles.srOnly}>סינון תיקים</span>
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option>הכול</option>
              <option>דחוף</option>
              {statusOptions.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
        </section>

        <div className={styles.clientWorkspace}>
          <section className={styles.clientListPanel} aria-label="רשימת תיקים">
            <div className={styles.listCount}>
              <span>{filteredClients.length} תוצאות</span>
              <span>הטיסה הקרובה בראש</span>
            </div>
            <div className={styles.clientList}>
              {filteredClients.length ? (
                filteredClients.map((client) => (
                  <article
                    className={classNames(
                      styles.clientCard,
                      selectedClient?.id === client.id &&
                        styles.clientCardActive,
                    )}
                    key={client.id}
                  >
                    <button
                      className={styles.clientCardMain}
                      type="button"
                      onClick={() => selectClient(client.id, true)}
                      aria-pressed={selectedClient?.id === client.id}
                    >
                      <span className={styles.avatar}>{client.initials}</span>
                      <span className={styles.clientCardIdentity}>
                        <span>
                          <strong>{client.name}</strong>
                          <small>{client.referenceNo ?? client.id}</small>
                        </span>
                        <span
                          className={classNames(
                            styles.statusBadge,
                            statusClass[client.status],
                          )}
                        >
                          {client.status}
                        </span>
                      </span>
                      <span className={styles.clientFlight}>
                        <small>{client.destination}</small>
                        <strong>{client.remainingLabel}</strong>
                      </span>
                    </button>
                    <div className={styles.clientCardFooter}>
                      <span>
                        <Clock3 aria-hidden="true" size={14} />{" "}
                        {client.nextActionDue}
                      </span>
                      {renderContactActions(client, true)}
                    </div>
                  </article>
                ))
              ) : (
                <div className={styles.emptyState}>
                  <Search aria-hidden="true" size={28} />
                  <strong>לא מצאנו תיק מתאים</strong>
                  <span>אפשר לשנות את החיפוש או להסיר את הסינון.</span>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setFilter("הכול");
                    }}
                  >
                    ניקוי חיפוש
                  </button>
                </div>
              )}
            </div>
          </section>

          {selectedClient && (
            <article
              className={styles.clientDetail}
              ref={clientDetailRef}
              aria-labelledby="client-detail-heading"
            >
              <div className={styles.detailHeader}>
                <div className={styles.detailIdentity}>
                  <span
                    className={classNames(styles.avatar, styles.avatarLarge)}
                  >
                    {selectedClient.initials}
                  </span>
                  <div>
                    <span>
                      {selectedClient.referenceNo ?? selectedClient.id}
                    </span>
                    <h2 id="client-detail-heading">{selectedClient.name}</h2>
                    <small>{selectedClient.lastContact}</small>
                  </div>
                </div>
                {renderContactActions(selectedClient)}
              </div>

              <div className={styles.detailControls}>
                <label>
                  <span>סטטוס תיק</span>
                  <select
                    disabled={busy}
                    className={statusClass[selectedClient.status]}
                    value={selectedClient.status}
                    onChange={(event) => {
                      void updateClient(selectedClient.id, {
                        status: event.target.value as CaseStatus,
                        ...(event.target.value === "בהמתנה"
                          ? { waitingOn: "customer" }
                          : {}),
                      });
                    }}
                  >
                    {statusOptions.map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>סטטוס תשלום</span>
                  <select
                    disabled={busy}
                    className={paymentClass[selectedClient.payment]}
                    value={selectedClient.payment}
                    onChange={(event) => {
                      void updateClient(selectedClient.id, {
                        payment: event.target.value as PaymentStatus,
                      });
                    }}
                  >
                    {paymentOptions.map((payment) => (
                      <option key={payment}>{payment}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>אחראי/ת</span>
                  <select
                    disabled={busy || demo}
                    value={selectedClient.ownerId ?? ""}
                    onChange={(event) =>
                      void updateClient(selectedClient.id, {
                        ownerId: event.target.value,
                      })
                    }
                  >
                    <option value="">לא שויך</option>
                    {staff.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.displayName ||
                          member.fullName ||
                          member.name ||
                          member.email}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedClient.status === "בהמתנה" && (
                  <label>
                    <span>ממתינים ל־</span>
                    <select
                      disabled={busy}
                      value={selectedClient.waitingOn || "customer"}
                      onChange={(event) =>
                        void updateClient(selectedClient.id, {
                          waitingOn: event.target.value,
                        })
                      }
                    >
                      {WAITING_ON_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              <section
                className={styles.detailFlight}
                aria-labelledby="detail-flight-heading"
              >
                <div className={styles.detailFlightTop}>
                  <div>
                    <span>
                      <PlaneTakeoff aria-hidden="true" size={16} /> הטיסה
                    </span>
                    <h3 id="detail-flight-heading">
                      {selectedClient.destination}
                    </h3>
                  </div>
                  <div
                    className={classNames(
                      styles.detailCountdown,
                      (selectedClient.remainingHours ?? 1000) < 24 &&
                        styles.detailCountdownUrgent,
                    )}
                  >
                    <strong>
                      {selectedClient.remainingHours === null
                        ? "—"
                        : Math.max(0, Math.ceil(selectedClient.remainingHours))}
                    </strong>
                    <span>
                      {selectedClient.remainingHours === null
                        ? "לא נקבעה"
                        : selectedClient.remainingHours <= 0
                          ? "הטיסה עברה"
                          : "שעות נותרו"}
                    </span>
                  </div>
                </div>
                <div className={styles.flightFacts}>
                  <span>
                    <CalendarDays aria-hidden="true" size={16} />{" "}
                    {selectedClient.flightDate}
                  </span>
                  <span>
                    <Clock3 aria-hidden="true" size={16} />{" "}
                    {selectedClient.flightTime}
                  </span>
                  <span className={styles.urgencyText}>
                    {getUrgencyLabel(selectedClient)}
                  </span>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setExtraModal("flight")}
                  >
                    עדכון טיסה
                  </button>
                </div>
                {/* What the customer actually wrote on the public form, kept
                    visually apart from the flight facts above: the arrival date
                    is their estimate, not a confirmed flight time, and reading
                    the two as one line is exactly the mistake to avoid. Absent
                    entirely for cases that did not come from that form. */}
                {(selectedClient.intakePlan ||
                  selectedClient.intakeArrival ||
                  selectedClient.contactLocale) && (
                  <p className={styles.intakeFacts}>
                    <span>מהטופס באתר:</span>
                    {selectedClient.intakePlan && (
                      <span>מסלול {selectedClient.intakePlan}</span>
                    )}
                    {selectedClient.intakeArrival && (
                      <span>הגעה משוערת {selectedClient.intakeArrival}</span>
                    )}
                    {selectedClient.contactLocale && (
                      <span>שפת הפנייה: {selectedClient.contactLocale}</span>
                    )}
                  </p>
                )}
                <div className={styles.readinessBlock}>
                  <div>
                    <span>השלמת משימות התיק</span>
                    <strong>{selectedClient.readiness}%</strong>
                  </div>
                  <div className={styles.readinessTrack}>
                    <span style={{ width: `${selectedClient.readiness}%` }} />
                  </div>
                </div>
              </section>

              <section
                className={styles.nextActionCard}
                aria-labelledby="next-action-heading"
              >
                <span className={styles.nextActionIcon}>
                  <Clock3 aria-hidden="true" size={20} />
                </span>
                <div>
                  <span>הפעולה הבאה · {selectedClient.nextActionDue}</span>
                  <h3 id="next-action-heading">{selectedClient.nextAction}</h3>
                </div>
                <button
                  type="button"
                  disabled={
                    busy ||
                    !tasks.some(
                      (task) =>
                        task.clientId === selectedClient.id && !task.completed,
                    )
                  }
                  onClick={() => {
                    const task = tasks.find(
                      (item) =>
                        item.clientId === selectedClient.id && !item.completed,
                    );
                    if (task) void toggleTask(task.id);
                  }}
                >
                  <Check aria-hidden="true" size={18} /> סימון כבוצע
                </button>
              </section>
              <div className={styles.caseQuickActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setExtraModal("task")}
                >
                  <Plus size={16} aria-hidden="true" />
                  משימה לתיק
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setExtraModal("log")}
                >
                  תיעוד יצירת קשר
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setExtraModal("contact")}
                >
                  עריכת פרטי קשר
                </button>
              </div>

              <div className={styles.detailTwoColumns}>
                <section
                  className={styles.infoSection}
                  aria-labelledby="contact-heading"
                >
                  <div className={styles.sectionTitle}>
                    <span>פרטי קשר</span>
                    <h3 id="contact-heading">פרטי הלקוח</h3>
                  </div>
                  <dl className={styles.contactDetails}>
                    <div>
                      <dt>
                        <Phone aria-hidden="true" size={16} /> טלפון
                      </dt>
                      <dd dir="ltr">{selectedClient.phone}</dd>
                    </div>
                    <div>
                      <dt>
                        <Mail aria-hidden="true" size={16} /> אימייל
                      </dt>
                      <dd dir="ltr">{selectedClient.email}</dd>
                    </div>
                    <div>
                      <dt>
                        <Activity aria-hidden="true" size={16} /> שירות
                      </dt>
                      <dd>{selectedClient.service}</dd>
                    </div>
                    <div>
                      <dt>
                        <Inbox aria-hidden="true" size={16} /> מקור
                      </dt>
                      <dd>{selectedClient.source}</dd>
                    </div>
                    <div>
                      <dt>
                        <MessageCircle aria-hidden="true" size={16} /> ערוץ
                        מועדף
                      </dt>
                      <dd>
                        {{ whatsapp: "וואטסאפ", phone: "טלפון", email: "מייל" }[
                          selectedClient.preferredChannel ?? ""
                        ] ?? "לא צוין"}
                      </dd>
                    </div>
                  </dl>

                  {/* Everything the customer submitted on the public form,
                      every value copyable. Present only on cases that came
                      through the website bridge; a case opened by staff has
                      nothing to show here and the block does not render. */}
                  {(selectedClient.intakePassport ||
                    selectedClient.intakeCondition ||
                    selectedClient.selfieFile) && (
                    <div className={styles.intakeRecord}>
                      <div className={styles.sectionTitle}>
                        <span>מהטופס באתר</span>
                        <h3 id="intake-heading">הפנייה כפי שנשלחה</h3>
                      </div>
                      <CopyField
                        label="שם מלא"
                        value={selectedClient.name}
                      />
                      <CopyField label="טלפון" value={selectedClient.phone} />
                      <CopyField label="אימייל" value={selectedClient.email} />
                      <CopyField
                        label="מספר דרכון"
                        value={selectedClient.intakePassport ?? ""}
                      />
                      <CopyField
                        label="גיל"
                        value={selectedClient.intakeAge ?? ""}
                      />
                      <CopyField
                        label="יעד"
                        value={selectedClient.destination}
                      />
                      <CopyField
                        label="מסלול"
                        value={selectedClient.intakePlan ?? ""}
                      />
                      <CopyField
                        label="הגעה משוערת"
                        value={selectedClient.intakeArrival ?? ""}
                      />
                      <CopyField
                        label="מרשם קיים"
                        value={selectedClient.intakeRxState ?? ""}
                      />
                      <CopyField
                        label="תיאור המצב"
                        value={selectedClient.intakeCondition ?? ""}
                        block
                      />
                      {selectedClient.intakeConsents?.length ? (
                        <CopyField
                          label="הסכמות"
                          value={selectedClient.intakeConsents.join(", ")}
                          display={selectedClient.intakeConsents.join(" · ")}
                          block
                        />
                      ) : null}
                      <IntakeFiles client={selectedClient} />
                    </div>
                  )}
                </section>

                <section
                  className={styles.infoSection}
                  aria-labelledby="activity-detail-heading"
                >
                  <div className={styles.sectionTitle}>
                    <span>ציר זמן</span>
                    <h3 id="activity-detail-heading">פעילות בתיק</h3>
                  </div>
                  <div className={styles.activityTimeline}>
                    {selectedClient.activities.map((activity) => (
                      <div key={activity.id}>
                        <span
                          className={styles.activityDot}
                          data-tone={activity.tone}
                        />
                        <p>
                          <strong>{activity.label}</strong>
                          <small>{activity.meta}</small>
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <section
                className={styles.templatePanel}
                aria-labelledby="templates-heading"
              >
                <h3 id="templates-heading">הודעה מוכנה לוואטסאפ</h3>
                <label>
                  <span className={styles.srOnly}>סוג הודעה</span>
                  <select
                    value={templateKey}
                    onChange={(event) =>
                      setTemplateKey(event.target.value as WhatsAppTemplateKey)
                    }
                  >
                    {Object.values(WHATSAPP_TEMPLATES).map((template) => (
                      <option key={template.key} value={template.key}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p>
                  {renderWhatsAppTemplate(templateKey, {
                    firstName: selectedClient.name.split(" ")[0],
                    caseReference:
                      selectedClient.referenceNo ?? selectedClient.id,
                    flightCountdown: selectedClient.remainingLabel,
                  })}
                </p>
                <div>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          renderWhatsAppTemplate(templateKey, {
                            firstName: selectedClient.name.split(" ")[0],
                            caseReference:
                              selectedClient.referenceNo ?? selectedClient.id,
                            flightCountdown: selectedClient.remainingLabel,
                          }),
                        );
                        setToast("נוסח ההודעה הועתק");
                      } catch {
                        setToast("ההעתקה לא זמינה בדפדפן הזה");
                      }
                    }}
                  >
                    העתקת נוסח
                  </button>
                  <a
                    className={styles.primaryButton}
                    aria-disabled={demo}
                    href={
                      demo
                        ? undefined
                        : `https://wa.me/${selectedClient.phoneLink}?text=${encodeURIComponent(renderWhatsAppTemplate(templateKey, { firstName: selectedClient.name.split(" ")[0], caseReference: selectedClient.referenceNo ?? selectedClient.id, flightCountdown: selectedClient.remainingLabel }))}`
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    פתיחה בוואטסאפ
                  </a>
                </div>
                <small>
                  ההודעה נפתחת לעריכה ולשליחה בוואטסאפ. המערכת אינה מקבלת אישור
                  שליחה או קריאה.
                </small>
              </section>

              <section
                className={styles.noteComposer}
                aria-labelledby="note-heading"
              >
                <div>
                  <span>הערה חדשה</span>
                  <h3 id="note-heading">תיעוד תפעולי</h3>
                  <small>אין להזין מידע רפואי או מסמכים רגישים.</small>
                </div>
                <textarea
                  aria-label="הערה תפעולית"
                  maxLength={500}
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  placeholder="למשל: הלקוח ביקש שנחזור אליו בשעה 18:00"
                  rows={3}
                />
                <button
                  type="button"
                  disabled={busy || !noteDraft.trim()}
                  onClick={saveOperationalNote}
                >
                  <Send aria-hidden="true" size={17} /> שמירת הערה
                </button>
              </section>
            </article>
          )}
        </div>
      </div>
    );
  }

  function renderTasks() {
    const buckets: CrmTask["bucket"][] = ["באיחור", "היום", "בהמשך"];

    return (
      <div className={styles.viewStack}>
        <section className={styles.pageIntro} aria-labelledby="tasks-heading">
          <div>
            <p>{viewHeadings.tasks.eyebrow}</p>
            <h1 id="tasks-heading">{viewHeadings.tasks.title}</h1>
            <span>
              {openTaskCount} משימות פתוחות · {overdueTaskCount} באיחור
            </span>
          </div>
          <button
            className={styles.secondaryButton}
            type="button"
            disabled={!clients.length}
            onClick={() => setExtraModal("task")}
          >
            <Plus aria-hidden="true" size={19} /> משימה חדשה
          </button>
        </section>

        <div className={styles.taskBoard}>
          {buckets.map((bucket) => {
            const bucketTasks = tasks.filter((task) => task.bucket === bucket);
            return (
              <section
                className={styles.taskColumn}
                key={bucket}
                aria-labelledby={`bucket-${bucket}`}
              >
                <div className={styles.taskColumnHeader}>
                  <span className={styles.bucketDot} data-bucket={bucket} />
                  <h2 id={`bucket-${bucket}`}>{bucket}</h2>
                  <span>
                    {bucketTasks.filter((task) => !task.completed).length}
                  </span>
                </div>
                <div className={styles.taskColumnList}>
                  {bucketTasks.map((task) => (
                    <article
                      className={classNames(
                        styles.taskCard,
                        task.completed && styles.taskCardDone,
                      )}
                      key={task.id}
                    >
                      <button
                        type="button"
                        onClick={() => toggleTask(task.id)}
                        aria-label={`${task.completed ? "פתיחת" : "השלמת"} המשימה ${task.title}`}
                      >
                        {task.completed ? (
                          <CheckCircle2 aria-hidden="true" size={22} />
                        ) : (
                          <Circle aria-hidden="true" size={22} />
                        )}
                      </button>
                      <button
                        className={styles.taskCardCopy}
                        type="button"
                        onClick={() => openClient(task.clientId)}
                      >
                        <strong>{task.title}</strong>
                        <span>{task.client}</span>
                      </button>
                      <div>
                        <Clock3 aria-hidden="true" size={14} />
                        <span>{task.due}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <section className={styles.taskSummary}>
          <div>
            <CheckCircle2 aria-hidden="true" size={22} />
            <span>
              <strong>{tasks.filter((task) => task.completed).length}</strong>{" "}
              משימות הושלמו
            </span>
          </div>
          <p>
            {demo
              ? "מצב הדגמה: השינויים זמניים ונמחקים ברענון."
              : "המשימות נשמרות במערכת ומשותפות לצוות."}
          </p>
        </section>
      </div>
    );
  }

  function renderAnalytics() {
    return (
      <div className={styles.viewStack}>
        <section
          className={styles.pageIntro}
          aria-labelledby="analytics-heading"
        >
          <div>
            <p>{viewHeadings.analytics.eyebrow}</p>
            <h1 id="analytics-heading">{viewHeadings.analytics.title}</h1>
            <span>
              {demo ? "נתוני דוגמה בלבד" : "נתונים מכל התיקים במערכת"}
            </span>
          </div>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() =>
              void refresh()
                .then(() =>
                  setToast(demo ? "מצב הדגמה פעיל" : "הנתונים עודכנו"),
                )
                .catch(() => setError("לא ניתן לרענן כרגע"))
            }
          >
            <Activity aria-hidden="true" size={18} /> רענון נתונים
          </button>
        </section>

        <section className={styles.analyticsHero}>
          <div>
            <span>תיקים שהושלמו</span>
            <strong>{completionRate}%</strong>
            <small>
              {completedCount} מתוך {clients.length} תיקים
            </small>
          </div>
          <div
            className={styles.ringChart}
            style={{
              background: `conic-gradient(#d6b671 ${completionRate}%, #31514f 0)`,
            }}
            aria-label={`שיעור השלמה ${completionRate} אחוז`}
          >
            <span>
              {completionRate}
              <small>%</small>
            </span>
          </div>
          <div className={styles.analyticsMiniStats}>
            <span>
              <small>זמן עד יצירת קשר</small>
              <strong>
                {stats.averageFirstResponseMinutes == null
                  ? "אין עדיין נתונים"
                  : `${Math.round(stats.averageFirstResponseMinutes)} דק׳`}
              </strong>
            </span>
            <span>
              <small>לקוחות ייחודיים</small>
              <strong>
                {
                  new Set(
                    clients.map(
                      (client) => client.contactId ?? client.phoneLink,
                    ),
                  ).size
                }
              </strong>
            </span>
            <span>
              <small>סומנו כשולמו</small>
              <strong>
                {clients.filter((client) => client.payment === "שולם").length}{" "}
                תיקים
              </strong>
            </span>
          </div>
        </section>

        <div className={styles.analyticsGrid}>
          <section
            className={styles.panel}
            aria-labelledby="lead-source-full-heading"
          >
            <div className={styles.panelHeader}>
              <div>
                <span>מקורות</span>
                <h2 id="lead-source-full-heading">התפלגות לידים</h2>
              </div>
            </div>
            <div className={styles.horizontalBars}>
              {sourceBreakdown.map((source) => (
                <div key={source.label}>
                  <span>{source.label}</span>
                  <div>
                    <i
                      className={styles[`source${source.color}`]}
                      style={{ width: `${source.value}%` }}
                    />
                  </div>
                  <strong>{source.value}%</strong>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.panel} aria-labelledby="pipeline-heading">
            <div className={styles.panelHeader}>
              <div>
                <span>תהליך אחוד</span>
                <h2 id="pipeline-heading">מצב התיקים</h2>
              </div>
            </div>
            <div className={styles.statusDistribution}>
              {statusOptions.map((label) => {
                const value = clients.filter(
                  (client) => client.status === label,
                ).length;
                return (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                    <div>
                      <i
                        style={{
                          width: `${(value / Math.max(1, clients.length)) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section
            className={classNames(styles.panel, styles.analyticsWide)}
            aria-labelledby="weekly-heading"
          >
            <div className={styles.panelHeader}>
              <div>
                <span>7 ימים אחרונים</span>
                <h2 id="weekly-heading">לידים חדשים לפי יום</h2>
              </div>
            </div>
            <div
              className={styles.weeklyChart}
              aria-label="תרשים לידים חדשים בשבעת הימים האחרונים"
            >
              {/* The window is always seven days now, so length alone is no
                  longer the question -- a week with no leads at all is still
                  better said in words than as seven flat bars. */}
              {stats.dailyLeads?.some((day) => day.count) ? (
                stats.dailyLeads.map((day) => (
                  <div key={day.date}>
                    <span
                      style={{
                        height: `${Math.max(2, (day.count / Math.max(1, ...stats.dailyLeads!.map((item) => item.count))) * 90)}%`,
                      }}
                    >
                      <i>{day.count}</i>
                    </span>
                    <small>{day.label}</small>
                  </div>
                ))
              ) : (
                <p>התרשים יתמלא כשייכנסו פניות למערכת.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.crmShell} dir="rtl">
      <a className={styles.skipLink} href="#crm-main">
        דילוג לתוכן הראשי
      </a>

      <aside className={styles.desktopRail} aria-label="ניווט ראשי">
        <div className={styles.crmBrand}>
          <span className={styles.brandMark}>
            <PlaneTakeoff aria-hidden="true" size={18} />
          </span>
          <span>
            <strong>GreekCloud</strong>
            <small>מרכז תפעול</small>
          </span>
        </div>

        <nav className={styles.railNav}>
          <span className={styles.navLabel}>סביבת עבודה</span>
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                data-active={view === item.id}
                onClick={() => setView(item.id)}
              >
                <Icon aria-hidden="true" size={19} />
                <span>{item.label}</span>
                {item.id === "tasks" && <em>{openTaskCount}</em>}
              </button>
            );
          })}
        </nav>

        <div className={styles.railFlightNote}>
          <Plane aria-hidden="true" size={17} />
          <div>
            <span>הטיסה הקרובה</span>
            <strong>
              {urgentClients[0]?.remainingLabel ?? "אין טיסות קרובות"}
            </strong>
          </div>
        </div>

        <div className={styles.operatorCard}>
          <span className={styles.operatorAvatar}>{user?.initials ?? "ד"}</span>
          <span>
            <strong>{user?.displayName ?? "סביבת הדגמה"}</strong>
            <small>{demo ? "תצוגה מקדימה" : "צוות GreekCloud"}</small>
          </span>
          <button
            type="button"
            aria-label="הגדרות מערכת"
            onClick={() => setExtraModal("settings")}
          >
            <MoreHorizontal aria-hidden="true" size={18} />
          </button>
        </div>
      </aside>

      <div className={styles.workspace}>
        <header className={styles.topbar}>
          <div className={styles.mobileBrand}>
            <span className={styles.brandMark}>
              <PlaneTakeoff aria-hidden="true" size={17} />
            </span>
            <span>
              <strong>GreekCloud</strong>
              <small>מרכז תפעול</small>
            </span>
          </div>
          <div className={styles.topbarContext}>
            <span>{todayLabel}</span>
            <small>{demo ? "מצב הדגמה" : "סביבת עבודה מאובטחת"}</small>
          </div>
          <div className={styles.topbarActions}>
            <button
              className={styles.notificationButton}
              type="button"
              aria-label="הגדרות והתקנה בנייד"
              onClick={() => setExtraModal("settings")}
            >
              <SlidersHorizontal aria-hidden="true" size={19} />
            </button>
            <button
              className={styles.topbarLeadButton}
              type="button"
              onClick={() => setLeadModalOpen(true)}
            >
              <Plus aria-hidden="true" size={18} />
              <span>ליד חדש</span>
            </button>
            <button
              className={styles.notificationButton}
              type="button"
              aria-label={`התראות${notifications.length ? `, ${notifications.length} חדשות` : ""}`}
              aria-expanded={isNotificationsOpen}
              onClick={() => setNotificationsOpen((open) => !open)}
            >
              <Bell aria-hidden="true" size={20} />
              {notifications.length > 0 && <span>{notifications.length}</span>}
            </button>
          </div>
        </header>

        <div className={styles.alertStrip} role="status">
          <span className={styles.alertPulse} aria-hidden="true" />
          <strong>
            {urgentClients.length} תיקים עם טיסה ב־72 השעות הקרובות
          </strong>
          <span>מומלץ לבדוק שהפעולה הבאה ברורה ומתוזמנת.</span>
          <button
            type="button"
            onClick={() => {
              setFilter("דחוף");
              setView("clients");
            }}
          >
            לפתיחת הרשימה <ChevronLeft aria-hidden="true" size={16} />
          </button>
        </div>

        <main className={styles.mainContent} id="crm-main" tabIndex={-1}>
          {demo && (
            <div className={styles.setupBanner}>
              <strong>תצוגה מקדימה · נתוני דוגמה</strong>
              <span>
                השינויים כאן זמניים. חיבור חשבון המערכת יאפשר שמירה, משתמשים
                והתראות.
              </span>
              <button type="button" onClick={() => setExtraModal("settings")}>
                פרטי החיבור
              </button>
            </div>
          )}
          {error && (
            <div className={styles.errorBanner} role="alert">
              {error}
              <button
                type="button"
                onClick={() =>
                  void refresh().catch(() => setError("החיבור עדיין אינו זמין"))
                }
              >
                ניסיון נוסף
              </button>
            </div>
          )}
          {loading && <p role="status">טוען את סביבת העבודה…</p>}
          {view === "dashboard" && renderDashboard()}
          {view === "clients" && renderClients()}
          {view === "tasks" && renderTasks()}
          {view === "analytics" && renderAnalytics()}
        </main>
      </div>

      <nav className={styles.mobileNav} aria-label="ניווט ראשי לנייד">
        {navigation.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              data-active={view === item.id}
              onClick={() => setView(item.id)}
            >
              <Icon aria-hidden="true" size={21} />
              <span>{item.shortLabel}</span>
              {item.id === "tasks" && openTaskCount > 0 && (
                <em>{openTaskCount}</em>
              )}
            </button>
          );
        })}
      </nav>

      {isNotificationsOpen && (
        <>
          <button
            className={styles.drawerBackdrop}
            type="button"
            aria-label="סגירת ההתראות"
            onClick={() => setNotificationsOpen(false)}
          />
          <aside
            className={styles.notificationDrawer}
            role="dialog"
            aria-modal="true"
            aria-labelledby="notifications-heading"
          >
            <div className={styles.drawerHeader}>
              <div>
                <span>מרכז התראות</span>
                <h2 id="notifications-heading">מה דורש תשומת לב</h2>
              </div>
              <button
                type="button"
                onClick={() => setNotificationsOpen(false)}
                aria-label="סגירת ההתראות"
              >
                <X aria-hidden="true" size={20} />
              </button>
            </div>
            {notifications.length ? (
              <div className={styles.notificationList}>
                {notifications.map((notification) => (
                  <button
                    type="button"
                    key={notification.id}
                    onClick={() => openClient(notification.clientId)}
                  >
                    <span
                      className={classNames(
                        styles.notificationIndicator,
                        notification.urgent && styles.notificationUrgent,
                      )}
                    />
                    <span>
                      <strong>{notification.title}</strong>
                      <small>{notification.detail}</small>
                      <em>{notification.time}</em>
                    </span>
                    <ChevronLeft aria-hidden="true" size={17} />
                  </button>
                ))}
              </div>
            ) : (
              <div className={styles.drawerEmpty}>
                <CheckCircle2 aria-hidden="true" size={32} />
                <strong>הכול שקט כרגע</strong>
                <span>התראות חדשות יופיעו כאן.</span>
              </div>
            )}
            {notifications.length > 0 && (
              <button
                disabled={busy}
                className={styles.markReadButton}
                type="button"
                onClick={async () => {
                  if (await mutate({ type: "dismiss_notifications" })) {
                    if (demo) setNotifications([]);
                    setToast("כל ההתראות סומנו כנקראו");
                  }
                }}
              >
                סימון הכול כנקרא
              </button>
            )}
          </aside>
        </>
      )}

      {isLeadModalOpen && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onMouseDown={() => setLeadModalOpen(false)}
        >
          <section
            className={styles.leadModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-lead-heading"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <span>תיק חדש</span>
                <h2 id="new-lead-heading">הוספת ליד</h2>
                <p>נאסוף רק את מה שצריך כדי להתחיל.</p>
              </div>
              <button
                type="button"
                onClick={() => setLeadModalOpen(false)}
                aria-label="סגירת הטופס"
              >
                <X aria-hidden="true" size={21} />
              </button>
            </div>
            <form className={styles.leadForm} onSubmit={handleNewLead}>
              <label className={styles.formField}>
                <span>שם מלא *</span>
                <input
                  ref={nameInputRef}
                  name="name"
                  required
                  autoComplete="name"
                  placeholder="ישראל ישראלי"
                />
              </label>
              <label className={styles.formField}>
                <span>טלפון *</span>
                <input
                  name="phone"
                  required
                  inputMode="tel"
                  autoComplete="tel"
                  dir="ltr"
                  placeholder="050-000-0000"
                />
              </label>
              <label className={styles.formField}>
                <span>אימייל</span>
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  dir="ltr"
                  placeholder="name@example.com"
                />
              </label>
              <label className={styles.formField}>
                <span>יעד</span>
                <input name="destination" placeholder="למשל: אתונה" />
              </label>
              <label className={styles.formField}>
                <span>מועד טיסה (לפי שעון המכשיר)</span>
                <input name="flightDate" type="datetime-local" />
              </label>
              <label className={styles.formField}>
                <span>שירות</span>
                <select name="service">
                  {SERVICE_KIND_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.formField}>
                <span>מקור הפנייה</span>
                <select name="source" defaultValue="manual">
                  {LEAD_SOURCE_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.formHint}>
                <CheckCircle2 aria-hidden="true" size={18} />
                <span>לאחר השמירה תיווצר אוטומטית משימת יצירת קשר להיום.</span>
              </div>
              {error && (
                <p className={styles.formError} role="alert">
                  {error}
                </p>
              )}
              <div className={styles.formActions}>
                <button type="button" onClick={() => setLeadModalOpen(false)}>
                  ביטול
                </button>
                <button type="submit" disabled={busy}>
                  <UserPlus aria-hidden="true" size={18} />{" "}
                  {busy ? "שומר…" : "שמירה ופתיחת תיק"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {extraModal && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onMouseDown={() => !busy && setExtraModal(null)}
        >
          <section
            className={styles.leadModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="extra-modal-heading"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <span>סביבת העבודה שלך</span>
                <h2 id="extra-modal-heading">
                  {
                    {
                      task: "משימה חדשה",
                      flight: "עדכון הטיסה",
                      settings: "הגדרות וחיבורים",
                      contact: "עריכת פרטי הלקוח",
                      log: "תיעוד יצירת קשר",
                    }[extraModal]
                  }
                </h2>
              </div>
              <button
                type="button"
                aria-label="סגירת החלון"
                onClick={() => setExtraModal(null)}
              >
                <X size={21} aria-hidden="true" />
              </button>
            </div>
            {extraModal === "settings" ? (
              <div className={styles.settingsBody}>
                <p>
                  {demo
                    ? "סביבת הדגמה. חיבור חשבון הנתונים ומשתמש הצוות יפעיל שמירה אמיתית."
                    : `מחובר/ת בתור ${user?.displayName}`}
                </p>
                <dl>
                  <div>
                    <dt>שמירת נתונים והתחברות</dt>
                    <dd>{demo ? "ממתין לחיבור" : "מחובר"}</dd>
                  </div>
                  <div>
                    <dt>מייל</dt>
                    <dd>
                      {integrations.email
                        ? "פרטי החיבור הוגדרו"
                        : "ממתין לחיבור"}
                    </dd>
                  </div>
                  <div>
                    <dt>טלגרם</dt>
                    <dd>
                      {integrations.telegram
                        ? "פרטי החיבור הוגדרו"
                        : "ממתין לחיבור"}
                    </dd>
                  </div>
                  <div>
                    <dt>וואטסאפ</dt>
                    <dd>פתיחה באפליקציה עם נוסח מוכן</dd>
                  </div>
                </dl>
                <h3>איפה לקבל התראות</h3>
                <p>
                  ההתראות בתוך המערכת תמיד פעילות. שליחה חיצונית דורשת חיבור
                  וסריקה מתוזמנת.
                </p>
                <form
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    const next = {
                      email: data.get("email") === "on",
                      telegram: data.get("telegram") === "on",
                    };
                    if (await mutate({ type: "save_preferences", ...next })) {
                      setPreferences(next);
                      setToast(
                        demo ? "ההעדפות עודכנו בהדגמה" : "ההעדפות נשמרו",
                      );
                    }
                  }}
                >
                  <label className={styles.checkOption}>
                    <input
                      name="email"
                      type="checkbox"
                      defaultChecked={preferences.email}
                    />{" "}
                    התראות במייל
                  </label>
                  <label className={styles.checkOption}>
                    <input
                      name="telegram"
                      type="checkbox"
                      defaultChecked={preferences.telegram}
                    />{" "}
                    התראות בטלגרם
                  </label>
                  <button className={styles.secondaryButton} disabled={busy}>
                    שמירת העדפות
                  </button>
                </form>
                <h3>שמירה במסך הבית</h3>
                <p>
                  באייפון: פתיחה בספארי, שיתוף ← הוספה למסך הבית. באנדרואיד:
                  תפריט הדפדפן ← התקנה או הוספה למסך הבית.
                </p>
                <p>נדרש חיבור לאינטרנט לצפייה בנתונים ולעדכונם.</p>
                <a
                  href="/request"
                  className={styles.secondaryButton}
                  target="_blank"
                  rel="noreferrer"
                >
                  פתיחת טופס הפנייה הציבורי
                </a>
                {!demo && (
                  <form action={signOutFromCrm}>
                    <button type="submit" className={styles.secondaryButton}>
                      יציאה מהחשבון
                    </button>
                  </form>
                )}
              </div>
            ) : (
              <form className={styles.leadForm} onSubmit={handleExtraForm}>
                {extraModal === "task" && (
                  <>
                    <label className={styles.formField}>
                      <span>תיק</span>
                      <select name="caseId" defaultValue={selectedClient?.id}>
                        {clients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.name} · {client.referenceNo ?? client.id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.formField}>
                      <span>מה צריך לעשות</span>
                      <input
                        name="title"
                        required
                        maxLength={160}
                        placeholder="למשל: לחזור ללקוח"
                      />
                    </label>
                    <label className={styles.formField}>
                      <span>מועד לביצוע (שעון המכשיר)</span>
                      <input name="dueAt" type="datetime-local" required />
                    </label>
                  </>
                )}
                {extraModal === "flight" && selectedClient && (
                  <>
                    <label className={styles.formField}>
                      <span>יעד</span>
                      <input
                        name="destination"
                        maxLength={120}
                        defaultValue={
                          selectedClient.destination === "טרם נקבע"
                            ? ""
                            : selectedClient.destination
                        }
                      />
                    </label>
                    <label className={styles.formField}>
                      <span>מועד טיסה (שעון המכשיר)</span>
                      <input
                        name="flightAt"
                        type="datetime-local"
                        defaultValue={localDateTime(selectedClient.flightAt)}
                      />
                    </label>
                    <p className={styles.formHint}>
                      מועד הטיסה יוצג במערכת לפי שעון ישראל. מחיקת המועד תסיר את
                      הספירה לאחור.
                    </p>
                  </>
                )}
                {extraModal === "contact" && selectedClient && (
                  <>
                    <label className={styles.formField}>
                      <span>שם מלא</span>
                      <input
                        name="fullName"
                        required
                        maxLength={120}
                        defaultValue={selectedClient.name}
                      />
                    </label>
                    <label className={styles.formField}>
                      <span>טלפון</span>
                      <input
                        name="phone"
                        required
                        inputMode="tel"
                        dir="ltr"
                        defaultValue={selectedClient.phone}
                      />
                    </label>
                    <label className={styles.formField}>
                      <span>מייל</span>
                      <input
                        name="email"
                        type="email"
                        dir="ltr"
                        defaultValue={
                          selectedClient.email.includes("@")
                            ? selectedClient.email
                            : ""
                        }
                      />
                    </label>
                    <p className={styles.formHint}>
                      הפרטים יעודכנו בכל התיקים של הלקוח הזה.
                    </p>
                  </>
                )}
                {extraModal === "log" && (
                  <>
                    <p className={styles.formHint}>
                      יש לתעד לאחר שנוצר קשר בפועל. פתיחת כפתור וואטסאפ או חיוג
                      אינה מתועדת כשליחה.
                    </p>
                    <label className={styles.formField}>
                      <span>ערוץ יצירת הקשר</span>
                      <select name="channel">
                        <option value="phone">טלפון</option>
                        <option value="whatsapp">וואטסאפ</option>
                        <option value="email">מייל</option>
                      </select>
                    </label>
                  </>
                )}
                {error && (
                  <p className={styles.formError} role="alert">
                    {error}
                  </p>
                )}
                <div className={styles.formActions}>
                  <button type="button" onClick={() => setExtraModal(null)}>
                    ביטול
                  </button>
                  <button type="submit" disabled={busy}>
                    {busy ? "שומר…" : "שמירה"}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}

      <div
        className={classNames(styles.toast, toast && styles.toastVisible)}
        role="status"
        aria-live="polite"
      >
        <CheckCircle2 aria-hidden="true" size={19} />
        <span>{toast}</span>
      </div>
    </div>
  );
}
