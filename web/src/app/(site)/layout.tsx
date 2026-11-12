import { SiteHeader } from "@/components/site";
import { CookieNote, SiteFooter } from "@/components/site-footer";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
      <CookieNote />
    </>
  );
}
