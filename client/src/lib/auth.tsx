import type { FirebaseOptions } from "firebase/app";
import type createClient from "openapi-fetch";
import type { paths } from "../serverSchema";
import { initializeApp, getApps } from "firebase/app";
import type { User } from "firebase/auth";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup } from "firebase/auth";
import React from "react";

export const useAuth = (client: ReturnType<(typeof createClient<paths>)>) => {
    const [authSettings, setAuthSettings] = React.useState<paths["/auth_settings"]["get"]["responses"][200]["content"]["application/json"] | null>(null);
    const [authStatus, setAuthStatus] = React.useState<{currentUser: {user: User, token: string} | null,} | null>(null);

    React.useEffect(() => {
        const authSettingsRaw = process.env["NEXT_PUBLIC_AUTH_SETTINGS"];
        if (authSettingsRaw?.startsWith("{")) {
            setAuthSettings(JSON.parse(authSettingsRaw));
            console.log("Auth settings loaded from bundled variable");
        } else {
            (async () => {
                const response = await client.GET("/auth_settings");
                if (response.data) {
                    setAuthSettings(response.data);
                    console.log("Auth settings loaded from URL");
                } else {
                    console.error("Failed to load auth settings");
                }
            })();
        }
    }, [client]);

    React.useEffect(() => {
        if (!authSettings || authSettings.type === "none") {
            return;
        } else if (authSettings.type === "firebase") {
            if (getApps().length == 0) initializeApp(authSettings.firebaseConfig as FirebaseOptions);
            const unsubscribe = onAuthStateChanged(getAuth(), async (user) => {
                if (user) {
                    const token = await user.getIdToken();
                    setAuthStatus({ currentUser: { user, token } });
                } else {
                    setAuthStatus({ currentUser: null });
                }
            });
            console.log("Firebase auth state listener registered");
            return unsubscribe;
        } else {
            // @ts-expect-error unexpected value
            console.error(`Unsupported auth type: "${authSettings.type}"`);
            return;
        }
    }, [authSettings]);

    const signIn = React.useCallback(async () => {
        if (!authSettings || authSettings.type === "none") {
            return;
        } else if (authSettings.type === "firebase") {
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(getAuth(), provider);
            console.log(`Logged in as ${result.user.uid}`);
        } else {
        // @ts-expect-error unexpected value
            console.error(`Unsupported auth type: "${authSettings.type}"`);
            return;
        }
    }, [authSettings]);

    return { authSettings, authStatus, signIn };
};
