import { buildFamilyStatusUrl } from "../config/familyPortal";

export type FamilyLinkEmailInput = {
  email: string;
  familyToken: string;
  decedentDisplayName: string;
  funeralHomeName: string;
  senderName?: string;
};

export type FamilyLinkMailer = {
  sendFamilyLink: (input: FamilyLinkEmailInput) => Promise<{ delivered: boolean; family_url: string }>;
};

/** Console fallback when SendGrid is unset; same keys as staff invites. */
export function createDefaultFamilyLinkMailer(): FamilyLinkMailer {
  return {
    async sendFamilyLink(input) {
      const familyUrl = buildFamilyStatusUrl(input.familyToken);
      const apiKey = process.env.SENDGRID_API_KEY?.trim();
      const from = process.env.INVITE_FROM_EMAIL?.trim();
      if (!apiKey || !from) {
        console.info(
          `[family-link] SendGrid not configured — to=${input.email} url=${familyUrl}`,
        );
        return { delivered: false, family_url: familyUrl };
      }

      const { default: sendgridMail } = await import("@sendgrid/mail");
      sendgridMail.setApiKey(apiKey);
      const fromName = process.env.INVITE_FROM_NAME?.trim() || "Cremation Tracker";
      const who = input.senderName ?? input.funeralHomeName;
      await sendgridMail.send({
        to: input.email,
        from: { email: from, name: fromName },
        subject: `Cremation status for ${input.decedentDisplayName}`,
        text:
          `${who} shared a status link for ${input.decedentDisplayName}.\n\n` +
          `Open: ${familyUrl}\n\n` +
          `This page shows progress only. Contact ${input.funeralHomeName} with questions.`,
        html:
          `<p>${who} shared a status link for <strong>${input.decedentDisplayName}</strong>.</p>` +
          `<p><a href="${familyUrl}">View cremation status</a></p>` +
          `<p>This page shows progress only. Contact ${input.funeralHomeName} with questions.</p>`,
      });
      return { delivered: true, family_url: familyUrl };
    },
  };
}
