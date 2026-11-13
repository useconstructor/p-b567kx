import Image from "next/image";
import Link from "next/link";
import branding from "../../branding.json";

export default function NotFound() {
  return <main className="mx-auto w-full max-w-[1120px] px-4 py-8">
    <div className="flex items-center gap-3">
      <Image data-brand-logo="" src={branding.logoImageUrl || "/brand-mark.svg"} alt="" width={48} height={48} unoptimized />
      <p className="font-heading text-2xl font-bold">{branding.logoText}</p>
    </div>
    <h1 className="mt-8 text-[28px] leading-8 font-bold">No encontramos esta página</h1>
    <p className="mt-3">Puedes volver a tu lista de lectura.</p>
    <Link href="/" className="mt-4 inline-flex min-h-11 items-center rounded-[var(--radius)] bg-primary px-4 py-2 font-semibold text-white underline-offset-4 hover:underline">Volver a la lista</Link>
  </main>;
}
