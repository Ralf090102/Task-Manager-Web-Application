import { auth } from "@/lib/auth";
import RecurringTaskList from "@/components/RecurringTaskList";
import { redirect } from "next/navigation";

export default async function RecurringPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <RecurringTaskList />
    </div>
  );
}
