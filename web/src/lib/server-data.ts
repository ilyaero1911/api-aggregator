import { api } from "./api";
import type { FxRate, Model, Plan, PublicConfig } from "./types";

// Публичные данные для серверных страниц. Кэш на минуту: цены зависят от курса, он меняется раз в час.
const opts = { next: { revalidate: 60 } } as RequestInit;

export async function loadModels() {
  try {
    return await api<{ data: Model[]; usd_rub_micro: number }>("/api/models", opts);
  } catch {
    return { data: [] as Model[], usd_rub_micro: 0 };
  }
}

export async function loadPlans() {
  try {
    return (await api<{ data: Plan[] }>("/api/plans", opts)).data;
  } catch {
    return [] as Plan[];
  }
}

export async function loadFx() {
  try {
    return await api<{ data: FxRate[]; markup_bps: number }>("/api/fx", opts);
  } catch {
    return { data: [] as FxRate[], markup_bps: 0 };
  }
}

export async function loadConfig(): Promise<PublicConfig> {
  try {
    return await api<PublicConfig>("/api/config", opts);
  } catch {
    return { api_base_url: "http://localhost:3100/v1", oauth: [], registration_open: true, min_topup_kopecks: 10000, payment_provider: "fake" };
  }
}

export async function loadUsdRate(): Promise<number> {
  const fx = await loadFx();
  return fx.data.find((r) => r.currency === "USD")?.rub_micro ?? 95_000_000;
}
