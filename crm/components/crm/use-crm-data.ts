"use client";

import { useCallback, useEffect, useState } from "react";
import {
  initialClients,
  initialNotifications,
  initialTasks,
  type ClientCase,
  type CrmTask,
  type CrmNotification,
} from "./crm-data";

export type StaffMember = {
  id: string;
  displayName?: string;
  fullName?: string;
  name?: string;
  email?: string;
};
export type CrmStats = {
  averageFirstResponseMinutes?: number | null;
  dailyLeads?: { date: string; label: string; count: number }[];
};
type Snapshot = {
  clients: ClientCase[];
  tasks: CrmTask[];
  notifications: CrmNotification[];
  staff?: StaffMember[];
  stats?: CrmStats;
  preferences?: { email: boolean; telegram: boolean };
};

export function useCrmData(demo: boolean) {
  const [clients, setClients] = useState<ClientCase[]>(
    demo ? initialClients : [],
  );
  const [tasks, setTasks] = useState<CrmTask[]>(demo ? initialTasks : []);
  const [notifications, setNotifications] = useState<CrmNotification[]>(
    demo ? initialNotifications : [],
  );
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [stats, setStats] = useState<CrmStats>({});
  const [preferences, setPreferences] = useState({
    email: true,
    telegram: true,
  });
  const [loading, setLoading] = useState(!demo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (demo) return;
    const response = await fetch("/api/crm/data", { cache: "no-store" });
    if (response.status === 401 || response.status === 403) {
      setClients([]);
      setTasks([]);
      setNotifications([]);
      setStaff([]);
      setStats({});
      window.location.replace("/crm/login");
      throw new Error("נדרשת כניסה מחדש.");
    }
    const body = await response.json();
    if (!response.ok)
      throw new Error(body.error || "לא ניתן לטעון את הנתונים כרגע.");
    const snapshot = body as Snapshot;
    setClients(snapshot.clients);
    setTasks(snapshot.tasks);
    setNotifications(snapshot.notifications);
    setStaff(snapshot.staff || []);
    setStats(snapshot.stats || {});
    if (snapshot.preferences) setPreferences(snapshot.preferences);
    setError("");
  }, [demo]);

  useEffect(() => {
    if (demo) {
      // Demo dates stay useful without pretending that sample records are live.
      setClients(
        initialClients.map((client) => {
          const flight =
            client.remainingHours === null
              ? null
              : new Date(Date.now() + client.remainingHours * 3_600_000);
          return {
            ...client,
            flightAt: flight?.toISOString() ?? null,
            flightDate: flight
              ? new Intl.DateTimeFormat("he-IL", {
                  day: "numeric",
                  month: "long",
                  timeZone: "Asia/Jerusalem",
                }).format(flight)
              : "טרם נקבע",
            flightTime: flight
              ? new Intl.DateTimeFormat("he-IL", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Asia/Jerusalem",
                }).format(flight)
              : "—",
          };
        }),
      );
      return;
    }
    let active = true;
    const load = () =>
      refresh()
        .catch((err: unknown) => {
          if (active)
            setError(err instanceof Error ? err.message : "שגיאת חיבור");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    void load();
    const recheck = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("pageshow", recheck);
    document.addEventListener("visibilitychange", recheck);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("pageshow", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [demo, refresh]);

  const mutate = useCallback(
    async (payload: Record<string, unknown>) => {
      if (demo) return { ok: true, demo: true };
      setBusy(true);
      setError("");
      try {
        const response = await fetch("/api/crm/mutate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "הפעולה לא נשמרה. אפשר לנסות שוב.");
        try {
          await refresh();
        } catch {
          setError("הפעולה נשמרה, אך הרשימה לא התרעננה. יש לרענן נתונים.");
        }
        return body as { ok: boolean; caseId?: string; demo?: boolean };
      } catch (err) {
        setError(err instanceof Error ? err.message : "הפעולה לא נשמרה.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [demo, refresh],
  );

  return {
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
  };
}
