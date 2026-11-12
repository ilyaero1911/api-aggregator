import { Logo } from "@/components/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-side">
        <Logo />
        <div className="auth-board mono">
          {["anthropic/claude-sonnet-4.5", "openai/gpt-5", "google/gemini-2.5-pro", "deepseek/deepseek-v3.2", "qwen/qwen3-coder", "x-ai/grok-4"].map((m, i) => (
            <div key={m} className="auth-board-row"><span className="faint">{String(i + 1).padStart(2, "0")}</span><span>{m}</span><span className={i === 2 ? "signal" : "ok"}>{i === 2 ? "→ backup" : "ok"}</span></div>
          ))}
        </div>
      </div>
      <div className="auth-main">{children}</div>
    </div>
  );
}
