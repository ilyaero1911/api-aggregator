export default function Page() {
  return (
    <main style={{ maxWidth: 760, margin: "12vh auto", padding: 32 }}>
      <p style={{ color: "#93c5fd" }}>Локальное окружение разработчика</p>
      <h1 style={{ fontSize: 48, letterSpacing: -2 }}>NeuroGateway</h1>
      <p style={{ fontSize: 22, lineHeight: 1.6 }}>
        Единый контракт для работы с языковыми моделями.
      </p>
      <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
        Сейчас доступен инженерный каркас: контракты, миграции, mock-провайдер и
        проверки. Кабинет, ключи и пополнение баланса будут добавлены в
        последующих задачах.
      </p>
      <a
        style={{ color: "#93c5fd" }}
        href="https://github.com/ilyaero1911/api-aggregator"
      >
        Открыть документацию проекта →
      </a>
    </main>
  );
}
