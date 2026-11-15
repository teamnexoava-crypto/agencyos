import { APP_NAME, SUPPORT_WHATSAPP } from "@shared/constants";

/** A WhatsApp chat link to support, with a message already typed in. */
export const whatsappSupportUrl = (message = `Hi, I need help with ${APP_NAME}.`) => `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(message)}`;
