import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Вход" };

export default function Login() {
  return <Suspense><AuthForm mode="login" /></Suspense>;
}
