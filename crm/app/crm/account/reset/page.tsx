import { AccountForm } from "@/components/crm/AccountForm";

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const query = await searchParams;
  return (
    <main>
      <AccountForm mode="reset" expired={query.expired === "1"} />
    </main>
  );
}
