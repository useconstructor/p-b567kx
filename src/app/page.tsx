import Image from "next/image";
import branding from "../../branding.json";
import ReadingList from "@/components/reading-list";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-[1152px] px-4 pt-4 pb-8 sm:pt-8 lg:pt-12">
      <header className="mb-6 lg:mb-8">
        <div className="flex items-center gap-2 sm:gap-3">
          <Image data-brand-logo="" src={branding.logoImageUrl || "/brand-mark.svg"} alt="" width={48} height={48}
            unoptimized priority className="size-10 shrink-0 object-contain sm:size-12" />
          <div>
            <h1 className="font-heading text-[28px] leading-8 font-bold tracking-[-0.02em] sm:text-4xl sm:leading-10">{branding.logoText}</h1>
            <p className="mt-1 text-sm leading-5 sm:text-base sm:leading-6">Un ejemplo de Esteban</p>
          </div>
        </div>
        <p className="mt-3 max-w-[800px] text-sm leading-5 lg:mt-4">
          App ficticia de ejemplo. Los libros se guardan solo en este navegador; no se sincronizan y pueden perderse al borrar sus datos.
        </p>
      </header>
      <ReadingList />
    </main>
  );
}
