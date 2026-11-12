"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { get } from "@/lib/api";
import type { User } from "@/lib/types";

type Ctx = { user: User; refresh: () => Promise<void>; setUser: (u: User) => void };
const Session = createContext<Ctx | null>(null);

/** Пускает в кабинет только с сессией; admin=true — только администраторов. */
export function SessionGate({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();
  const refresh = useCallback(async () => {
    const r = await get<{ user: User | null }>("/api/auth/me");
    if (!r.user) {
      router.replace(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }
    if (admin && r.user.role !== "admin") {
      router.replace("/dashboard");
      return;
    }
    setUser(r.user);
  }, [router, admin]);
  useEffect(() => { refresh().catch(() => router.replace("/login")); }, [refresh, router]);
  if (!user) return <div className="gate"><span className="label">NeuroGateway</span></div>;
  return <Session.Provider value={{ user, refresh, setUser }}>{children}</Session.Provider>;
}

export function useSession(): Ctx {
  const c = useContext(Session);
  if (!c) throw new Error("useSession outside SessionGate");
  return c;
}
