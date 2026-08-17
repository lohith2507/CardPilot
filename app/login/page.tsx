import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";
import { appPassword } from "@/lib/auth";
import { googleEnabled } from "@/lib/google";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm google={googleEnabled()} password={appPassword() !== null} />
    </Suspense>
  );
}
