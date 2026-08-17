import { ChangePasswordForm } from "@/components/change-password-form";
import { requirePasswordChangeSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const session = await requirePasswordChangeSession();
  return (
    <ChangePasswordForm email={session.email} firstLogin={session.mustChangePassword} />
  );
}
