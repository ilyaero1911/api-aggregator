import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Регистрация" };

export default function Register() {
  return <Suspense><AuthForm mode="register" /></Suspense>;
}
