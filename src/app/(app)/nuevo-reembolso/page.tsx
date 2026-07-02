import { FormNuevoReembolso } from "@/components/reembolsos/FormNuevoReembolso";
import { PageHeader } from "@/components/ui/PageHeader";

export default function NuevoReembolsoPage() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <PageHeader
        titulo="Nuevo Reembolso"
        subtitulo="Captura un reembolso no deducible con sus comprobantes"
      />
      <FormNuevoReembolso />
    </main>
  );
}
