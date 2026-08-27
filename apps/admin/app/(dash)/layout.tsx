import { AuthProvider } from "@/lib/auth";
import { StoreProvider } from "@/lib/store";
import { MediaProvider } from "@/lib/media";
import { AppChrome } from "@/components/app-chrome";

/**
 * Everything that needs a session — the sign-in screens and the dashboard
 * behind them — sits under this one provider tree.
 *
 * It covers both because signing in on `/login` and landing on `/projects`
 * must share the same session state; splitting them would remount the provider
 * mid-flow and make the user wait through a second refresh. The public landing
 * page at `/` is deliberately outside it.
 *
 * This is a route group, so `(dash)` never appears in a URL.
 */
export default function DashLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <StoreProvider>
        <MediaProvider>
          {children}
          <AppChrome />
        </MediaProvider>
      </StoreProvider>
    </AuthProvider>
  );
}
