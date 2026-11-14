import { useBilling } from "./api";

/** Things the Free plan does not include, and how each is described where it would have been. */
export const LOCKED = {
  contracts: { title: "Contracts are on Growth and Premium", text: "Send agreements, collect e-signatures and keep a sealed copy of every signed contract. Contracts you made earlier are still here to read." },
  portal: { title: "The client portal is on Growth and Premium", text: "Give each client one private link with live progress, invoices, the contract and shared files. Links you shared earlier start working again as soon as you upgrade." },
  finance: { title: "Finance is on Growth and Premium", text: "Track expenses and see profit and loss for every project and for the whole business. Everything you recorded earlier is kept." },
  team: { title: "Team members are on Growth and Premium", text: "Invite your team, assign work and choose what each person can see. The Free plan is for one person." },
  sheets: { title: "Google Sheet sync is on Growth and Premium", text: "Connect a Google Sheet and new enquiries flow into your CRM by themselves." },
} as const;

export type LockedFeature = keyof typeof LOCKED;

/** True when the workspace's plan does not include this. */
export function useIsLocked(feature: LockedFeature): boolean {
  const { features, limits } = useBilling();
  if (feature === "team") return limits.members !== null && limits.members <= 1;
  if (feature === "sheets") return limits.sheets === 0;
  return !features[feature];
}
