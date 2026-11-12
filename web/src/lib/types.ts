export type User = {
  id: string; email: string; name: string; avatar_url: string; role: "user" | "admin"; status: "active" | "blocked";
  locale: "ru" | "en"; log_prompts: boolean; has_password: boolean; has_google: boolean; created_at: string; last_login_at: string | null;
};

export type Prices = { input_per_m: number; output_per_m: number; cache_read_per_m: number; image: number };

export type Model = {
  id: string; name: string; author: string; description: string; modality: "text" | "image";
  capabilities: string[]; categories: string[]; context_length: number; max_output: number;
  input_usd_micro: number; output_usd_micro: number; cache_read_usd_micro: number; image_usd_micro: number;
  open_weights: boolean; in_plans: boolean; enabled: boolean; released_at: string; created_at: string;
  prices: Prices; is_free: boolean; providers: string[];
};

export type Plan = {
  id: string; name_ru: string; name_en: string; description_ru: string; description_en: string; price_kopecks: number;
  period_days: number; token_quota: number; daily_free_requests: number; concurrency: number;
  features_ru: string[]; features_en: string[]; highlighted: boolean; sort: number; active: boolean;
};

export type Key = {
  id: string; kind: "inference" | "management"; name: string; prefix: string; limit_micro: number | null;
  limit_reset: "never" | "daily" | "weekly" | "monthly"; period_spent_micro: number; total_spent_micro: number;
  rpm_limit: number | null; disabled: boolean; expires_at: string | null; last_used_at: string | null; created_at: string; secret?: string;
};

export type Wallet = {
  user_id: string; balance_micro: number; low_balance_alert: boolean; low_balance_micro: number;
  auto_topup: boolean; auto_topup_below_micro: number; auto_topup_amount_micro: number;
};

export type Subscription = {
  id: string; plan_id: string; status: string; tokens_used: number; started_at: string; ends_at: string;
  name_ru: string; name_en: string; token_quota: number; daily_free_requests: number; concurrency: number;
};

export type Payment = {
  id: string; user_id: string; provider: string; purpose: "topup" | "plan"; plan_id: string | null; amount_kopecks: number;
  status: "pending" | "succeeded" | "failed" | "canceled"; external_id: string; confirmation_url: string; created_at: string; paid_at: string | null;
  email?: string;
};

export type Transaction = {
  id: string; kind: string; amount_micro: number; balance_after_micro: number; description: string; ref: string; created_at: string;
};

export type RequestLog = {
  id: string; user_id: string; api_key_id: string | null; model_id: string; provider_id: string; preset: string; endpoint: string;
  status: number; prompt_tokens: number; completion_tokens: number; cached_tokens: number; cost_micro: number;
  paid_by: "balance" | "plan" | "free"; latency_ms: number; ttft_ms: number; streamed: boolean; finish_reason: string;
  error: string; app: string; prompt_preview: string; created_at: string; key_name?: string; email?: string;
};

export type Preset = {
  id: string; slug: string; name: string; description: string; model_id: string; fallback_models: string[];
  system_prompt: string; temperature: number | null; max_tokens: number | null; created_at: string; updated_at: string;
};

export type FxRate = { currency: string; rub_micro: number; date: string; source: string; fetched_at: string; stale: boolean };

export type Stats = {
  totals: { prompt_tokens: number; completion_tokens: number; cached_tokens: number; requests: number; cost_micro: number; errors: number };
  series: { bucket: string; prompt_tokens: number; completion_tokens: number; requests: number; cost_micro: number }[];
  bucket: "hour" | "day";
  top_models: { model_id: string; requests: number; tokens: number; cost_micro: number }[];
  models: string[];
  balance_micro: number;
};

export type PublicConfig = {
  api_base_url: string; google_enabled: boolean; registration_open: boolean; min_topup_kopecks: number; payment_provider: string;
};
