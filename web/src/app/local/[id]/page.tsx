import { EstablishmentView } from "@/presentation/views/establishment/EstablishmentView";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EstablishmentView id={id} />;
}
