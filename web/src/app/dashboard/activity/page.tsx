"use client";

import { Icon, type IconName } from "@/components/icons";
import { PageHead, Skeleton, useLoad } from "@/components/ui";
import { get } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";

type Ev = { id: number; kind: string; details: string; ip: string; created_at: string };

const KINDS: Record<string, [IconName, string, string]> = {
  signup: ["sparkle", "Регистрация", "Sign-up"], login: ["logout", "Вход в аккаунт", "Sign-in"], password: ["lock", "Смена пароля", "Password changed"],
  "key.create": ["key", "Создан ключ", "Key created"], "key.revoke": ["trash", "Отозван ключ", "Key revoked"],
  payment: ["card", "Оплата прошла", "Payment completed"], plan: ["tag", "Подключён тариф", "Plan activated"],
};

export default function Activity() {
  const { lang } = useI18n();
  const en = lang === "en";
  const { data, loading } = useLoad(() => get<{ data: Ev[] }>("/api/me/events"));
  return (
    <>
      <PageHead title={en ? "Account activity" : "Действия в аккаунте"} lead={en ? "Sign-ins, key changes and payments. If you see something you did not do, change your password." : "Входы, изменения ключей и оплаты. Если видите действие, которое не совершали, смените пароль."} />
      {loading ? <Skeleton h={200} /> : data?.data.length === 0 ? <div className="empty">—</div> : (
        <div className="timeline">
          {data?.data.map((e) => {
            const [icon, ru, enL] = KINDS[e.kind] ?? ["history", e.kind, e.kind];
            return (
              <div key={e.id} className="tl-item">
                <span className="tl-ico"><Icon name={icon} size={16} /></span>
                <div className="grow">
                  <div>{en ? enL : ru}{e.details && <span className="muted"> · {e.details}</span>}</div>
                  <div className="hint">{dateTime(e.created_at, lang)}{e.ip && ` · IP ${e.ip}`}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
