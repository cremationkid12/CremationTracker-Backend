import type { AuthService } from "./services/authService";
import type { CaseService } from "./services/caseService";
import type { InviteMailer } from "./services/inviteMailer";
import type { InviteService } from "./services/inviteService";
import type { OrgService } from "./services/orgService";

export type AppServices = {
  authService: AuthService;
  orgService: OrgService;
  caseService: CaseService;
  inviteService: InviteService;
  inviteMailer: InviteMailer;
};
