# Integrating Neon Auth into VoiceMap

Looking at your code, you have mock auth stubs with comments pointing to where real API calls should go. Here's how to swap in **Neon Auth** (powered by Stack Auth) — it handles credentials, sessions, and user storage entirely, all synced to your Neon database.

---

## 1. Enable Neon Auth in your Neon Console

In your project dashboard → **Auth** tab → Enable it. Neon will provision a Stack Auth instance and give you three env vars to copy.

---

## 2. Install the SDK

```bash
npm install @stackframe/stack
```

---

## 3. Add env vars to `.env.local`

```bash
NEXT_PUBLIC_STACK_PROJECT_ID=...
NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY=...
STACK_SECRET_SERVER_KEY=...
```

---

## 4. Create `lib/stack.ts`

```ts
import "server-only";
import { StackServerApp } from "@stackframe/stack";

export const stackServerApp = new StackServerApp({
  tokenStore: "nextjs-cookie",
});
```

---

## 5. Create `app/handler/[...stack]/route.ts`

Stack Auth needs this catch-all route to handle OAuth callbacks, token refresh, etc.

```ts
import { stackServerApp } from "@/lib/stack";
export const { GET, POST } = stackServerApp.createNextjsHttpHandler();
```

---

## 6. Wrap your layout with `StackProvider`

In `app/layout.tsx`:

```tsx
import { StackProvider, StackTheme } from "@stackframe/stack";
import { stackServerApp } from "@/lib/stack";

export default async function RootLayout({ children }) {
  return (
    <html>
      <body>
        <StackProvider app={stackServerApp}>
          <StackTheme>
            {children}
          </StackTheme>
        </StackProvider>
      </body>
    </html>
  );
}
```

---

## 7. Replace the auth logic in `VoiceMap`

This is the core change — swap out all the manual auth state for Stack Auth hooks:

```tsx
"use client";
import { useUser, useStackApp } from "@stackframe/stack";

export default function VoiceMap() {
  const user = useUser();           // null if logged out, user object if logged in
  const stackApp = useStackApp();

  // Remove ALL of these — no longer needed:
  // const [user, setUser] = useState(null);
  // const [authOpen, setAuthOpen] = useState(false);
  // const [authMode, setAuthMode] = useState("login");
  // const [authForm, setAuthForm] = useState({...});
  // const [authError, setAuthError] = useState("");
  // const [authLoading, setAuthLoading] = useState(false);
  // handleLogin, handleSignup, handleLogout

  // Replace map click handler — redirect to sign-in instead of opening modal:
  map.on("click", (e) => {
    if (!user) {
      stackApp.redirectToSignIn();   // Stack Auth hosted UI handles everything
      return;
    }
    // ... rest of click logic
  });

  // Replace the alerts button click:
  onClick={() => {
    if (!user) { stackApp.redirectToSignIn(); return; }
    setAlertsOpen(true);
  }}

  // Replace sidebar bottom section:
  {user ? (
    <div>
      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 8 }}>
        Signed in as <span style={{ color: "#e8e8e8", fontWeight: 500 }}>
          {user.displayName ?? user.primaryEmail}
        </span>
      </div>
      <button onClick={() => stackApp.signOut()}>Sign out</button>
    </div>
  ) : (
    <div>
      <button onClick={() => stackApp.redirectToSignIn()}>Sign in</button>
      <button onClick={() => stackApp.redirectToSignUp()}>Sign up</button>
    </div>
  )}

  // DELETE the entire {authOpen && (...)} modal JSX block — Stack Auth
  // renders its own hosted sign-in/sign-up pages at /handler/sign-in

  // When submitting a report, use the Stack user ID:
  body: JSON.stringify({
    ...
    reporterUserId: user?.id ?? null,
    reporter: user ? {
      email: user.primaryEmail ?? null,
      displayName: user.displayName ?? null,
    } : {},
  }),
```

---

## 8. Optional: protect routes with middleware

Create `middleware.ts` at the project root if you want server-side route protection:

```ts
import { stackServerApp } from "@/lib/stack";
import { NextResponse } from "next/server";

export async function middleware(request) {
  const user = await stackServerApp.getUser();
  if (!user && request.nextUrl.pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/handler/sign-in", request.url));
  }
  return NextResponse.next();
}
```

---

## What you gain

| Before | After |
|---|---|
| Mock setTimeout login | Real JWT sessions |
| Passwords stored nowhere (mock) | Neon Auth handles hashing + storage |
| Manual error handling | SDK handles all edge cases |
| Custom auth modal UI | Polished hosted UI (or embeddable components) |
| `dbReporterUserId` workaround | `user.id` is stable and synced to your DB |

Stack Auth also supports OAuth (Google, GitHub, etc.) — you can enable those in the Neon Console with zero additional code changes.
