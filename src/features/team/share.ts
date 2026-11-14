import { APP_NAME } from "@shared/constants";
import { renderInviteMessage } from "@shared/schemas/team";
import type { InviteDTO } from "@shared/types";
import { useSession } from "@/features/auth/api";
import { copyToClipboard } from "@/lib/clipboard";
import { whatsappUrl } from "@/lib/whatsapp";

export const inviteUrl = (token: string) => `${window.location.origin}/invite/${token}`;

export interface ShareProps {
  invite: InviteDTO;
  template: string;
}

/** Copy / WhatsApp / email actions for an invite link. Reused in the dialog and the pending list. */
export function useInviteShare({ invite, template }: ShareProps) {
  const { user, workspace } = useSession();
  const link = inviteUrl(invite.token);
  const message = renderInviteMessage(template, { inviter_name: user.name, agency_name: workspace.name, invite_link: link });
  return {
    link,
    copy: () => void copyToClipboard(link, "Invite link copied"),
    // No phone number on an invite → wa.me opens WhatsApp's own contact picker.
    whatsappHref: whatsappUrl(null, message),
    mailHref: `mailto:${encodeURIComponent(invite.email)}?subject=${encodeURIComponent(`Join ${workspace.name} on ${APP_NAME}`)}&body=${encodeURIComponent(message)}`,
  };
}
