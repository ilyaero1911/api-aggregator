import { AuthSide } from "@/components/auth-side";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth">
      <AuthSide />
      <div className="auth-main">{children}</div>
    </div>
  );
}
