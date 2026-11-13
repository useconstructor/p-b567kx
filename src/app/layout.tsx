import type { Metadata } from "next";
import branding from "../../branding.json";
import "./globals.css";

const originalFonts: Record<string, string> = {
  "https://odifhpxpphpkaucgsthd.supabase.co/storage/v1/object/public/screenshots/projects/P-B567KX/brand/fonts/20ab9752bd19a373dba627393b6c142e6cf8fc2f219119a8e0cb1442ef679ec5.ttf": "/fonts/20ab9752bd19a373dba627393b6c142e6cf8fc2f219119a8e0cb1442ef679ec5.ttf",
  "https://odifhpxpphpkaucgsthd.supabase.co/storage/v1/object/public/screenshots/projects/P-B567KX/brand/fonts/bec4ffe926595df756b5a1e39a9f704debfab88055d9a157f978eb500444dd28.ttf": "/fonts/bec4ffe926595df756b5a1e39a9f704debfab88055d9a157f978eb500444dd28.ttf",
  "https://odifhpxpphpkaucgsthd.supabase.co/storage/v1/object/public/screenshots/projects/P-B567KX/brand/fonts/950e66c48e5e60c9407421d0fa601047176f17e0d22a598bbd084dde45a98be2.ttf": "/fonts/950e66c48e5e60c9407421d0fa601047176f17e0d22a598bbd084dde45a98be2.ttf",
  "https://odifhpxpphpkaucgsthd.supabase.co/storage/v1/object/public/screenshots/projects/P-B567KX/brand/fonts/83a72786970a93a8c48eaead886c995676d512c0ee7164138f8ea76ea847d75c.ttf": "/fonts/83a72786970a93a8c48eaead886c995676d512c0ee7164138f8ea76ea847d75c.ttf",
};
const fontStyles = branding.brandbook.fontFaces.map((face) =>
  `@font-face{font-family:${JSON.stringify(face.family)};font-style:normal;font-weight:${face.weight};font-display:swap;src:url(${JSON.stringify(originalFonts[face.url] || face.url)}) format("truetype");}`,
).join("\n");
const brandStyles = `:root{
  --brand-background:${branding.backgroundColor};
  --brand-surface:${branding.secondaryColor};
  --brand-primary:${branding.primaryColor};
  --brand-accent:${branding.accentColor};
  --brand-text:${branding.textColor};
  --brand-font-heading:${JSON.stringify(branding.fontHeading)},sans-serif;
  --brand-font-body:${JSON.stringify(branding.fontBody)},sans-serif;
  --radius:${branding.borderRadius};
}`;

export const metadata: Metadata = {
  title: "Lista de lectura — Esteban",
  description: "Un ejemplo de Esteban para guardar próximas lecturas y marcar libros como leídos en este navegador.",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Preserve the supplied installation; the configured public runtime can replace its source at integration.
  const constructorApi = (process.env.NEXT_PUBLIC_CONSTRUCTOR_API || "https://constructor-api-git-dev-useconstructor.vercel.app").replace(/\/$/, "");
  const projectId = process.env.NEXT_PUBLIC_PROJECT_ID || "P-B567KX";
  return (
    <html lang="es" className="min-h-full antialiased">
      <head><style>{fontStyles + "\n" + brandStyles}</style></head>
      <body className="min-h-screen bg-surface text-foreground">
        {children}
        <script src={"https://constructor-api-git-dev-useconstructor.vercel.app/v1/projects/P-B567KX/analytics/script.js"} defer></script>
        <script src="/constructor-editor.js" defer />
      </body>
    </html>
  );
}
