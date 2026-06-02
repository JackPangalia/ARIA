import { Suspense } from "react";
import { SignInScreen } from "@/components/firebase/SignInScreen";
import { AuthScreenLoader } from "@/components/firebase/AuthScreenLoader";

export default function SignInPage() {
  return (
    <Suspense fallback={<AuthScreenLoader />}>
      <SignInScreen />
    </Suspense>
  );
}
