export type InviteEmailInput = {
  email: string;
  inviteToken: string;
  orgName: string;
  inviterName?: string;
};

export type InviteMailer = {
  sendInvite: (input: InviteEmailInput) => Promise<void>;
};

function buildInviteLink(token: string, email: string): string {
  const base =
    process.env.INVITE_SIGNUP_URL?.trim() ||
    "http://localhost:8080/?invited=1";
  const url = new URL(base);
  url.searchParams.set("email", email);
  url.searchParams.set("invite_token", token);
  url.searchParams.set("invited", "1");
  return url.toString();
}

/** Console / no-op friendly mailer. Uses SendGrid when configured. */
export function createDefaultInviteMailer(): InviteMailer {
  return {
    async sendInvite(input) {
      const link = buildInviteLink(input.inviteToken, input.email);
      const apiKey = process.env.SENDGRID_API_KEY?.trim();
      const from = process.env.INVITE_FROM_EMAIL?.trim();
      if (!apiKey || !from) {
        console.info(
          `[invite] SendGrid not configured — invite for ${input.email} token=${input.inviteToken} link=${link}`,
        );
        return;
      }

      const { default: sendgridMail } = await import("@sendgrid/mail");
      sendgridMail.setApiKey(apiKey);
      const fromName = process.env.INVITE_FROM_NAME?.trim() || "Cremation Tracker";
      await sendgridMail.send({
        to: input.email,
        from: { email: from, name: fromName },
        subject: `You're invited to join ${input.orgName} on Cremation Tracker`,
        text: `${input.inviterName ?? "An admin"} invited you to join ${input.orgName}.\n\nOpen: ${link}`,
        html: `<p>${input.inviterName ?? "An admin"} invited you to join <strong>${input.orgName}</strong>.</p>
               <p><a href="${link}">Accept invite</a></p>
               <p>Or use invite token: <code>${input.inviteToken}</code></p>`,
      });
    },
  };
}
