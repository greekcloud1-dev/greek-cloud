import type { Metadata, Viewport } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  manifest: "/crm.webmanifest",
  applicationName: "GreekCloud — מרכז תפעול",
  appleWebApp: {
    capable: true,
    title: "GreekCloud",
    statusBarStyle: "default",
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#102731",
};

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return children;
}
