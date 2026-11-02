import type { ReactNode } from "react";
export const metadata = {
  title: "NeuroGateway · Development",
  description: "Local foundation workspace",
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui,sans-serif",
          background: "#0b1220",
          color: "#e2e8f0",
        }}
      >
        {children}
      </body>
    </html>
  );
}
