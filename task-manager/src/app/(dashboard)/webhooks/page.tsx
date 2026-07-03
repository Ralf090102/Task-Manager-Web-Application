import { auth } from "@/lib/auth";
import WebhookManager from "@/components/WebhookManager";
import { redirect } from "next/navigation";

export default async function WebhooksPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <WebhookManager />
    </div>
  );
}
