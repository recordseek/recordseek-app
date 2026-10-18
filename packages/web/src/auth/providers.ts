import {
  clearGeniToken,
  getGeniName,
  getGeniToken,
  myProfile,
  setGeniName,
} from "../geni";
import { clearZoteroLogin, getZoteroLogin } from "../zotero";
import { clearWikiTreeSession, getWikiTreeSession } from "../wikitree";
import { fetchFsUser, isFsAuthenticated, logoutFs } from "../fsAuth";

/** A service whose sign-in the header owns (Hello name + Log out). */
export interface AuthProvider {
  /** Same id the screen passes to useAutoSignIn. */
  id: string;
  label: string;
  logo: string;
  match(pathname: string): boolean;
  isSignedIn(): boolean;
  /** `network` false means use only what is already stored (Geni rate-limits). */
  displayName(network?: boolean): Promise<string | null>;
  logout(): Promise<void>;
}

const img = (file: string) => `${import.meta.env.BASE_URL}images/${file}`;

/** Drop everything a service stored in this tab, including its auto-sign-in marker. */
function forget(id: string, ...keys: string[]): void {
  try {
    sessionStorage.removeItem(`rs_auth_attempted_${id}`);
    for (const k of keys) sessionStorage.removeItem(k);
  } catch {
    /* storage unavailable */
  }
}

export const AUTH_PROVIDERS: AuthProvider[] = [
  {
    id: "fs",
    label: "FamilySearch",
    logo: img("familysearch-logo.svg"),
    match: (p) => p.startsWith("/fs-"),
    isSignedIn: isFsAuthenticated,
    async displayName() {
      const user = await fetchFsUser();
      return user?.displayName ?? user?.givenName ?? null;
    },
    async logout() {
      await logoutFs();
      forget("fs", "fs_pkce_verifier", "fs_return_route");
    },
  },
  {
    id: "geni",
    label: "Geni",
    logo: img("geni-logo.svg"),
    match: (p) => p.startsWith("/geni"),
    isSignedIn: () => getGeniToken() !== null,
    async displayName(network = true) {
      const cached = getGeniName();
      if (cached || !network) return cached;
      const token = getGeniToken();
      if (!token) return null;
      try {
        const me = await myProfile(token);
        if (me.name) setGeniName(me.name);
        return me.name || null;
      } catch {
        return null;
      }
    },
    async logout() {
      clearGeniToken(); // token, cached name and wizard state
      forget("geni");
    },
  },
  {
    id: "zotero",
    label: "Zotero",
    logo: img("zotero-logo.svg"),
    match: (p) => p.startsWith("/zotero"),
    isSignedIn: () => getZoteroLogin() !== null,
    displayName: async () => getZoteroLogin()?.username || null,
    async logout() {
      clearZoteroLogin();
      forget("zotero", "rs_zotero_new");
    },
  },
  {
    id: "wikitree",
    label: "WikiTree",
    logo: img("wikitree-logo.png"),
    match: (p) => p.startsWith("/wikitree"),
    isSignedIn: () => getWikiTreeSession() !== null,
    displayName: async () => getWikiTreeSession()?.userName ?? null,
    async logout() {
      clearWikiTreeSession();
      forget("wikitree");
    },
  },
];

export function providerForPath(pathname: string): AuthProvider | undefined {
  return AUTH_PROVIDERS.find((p) => p.match(pathname));
}
