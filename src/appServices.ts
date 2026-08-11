import type { AuthService } from "./services/authService";
import type { CaseService } from "./services/caseService";
import type { OrgService } from "./services/orgService";

export type AppServices = {
  authService: AuthService;
  orgService: OrgService;
  caseService: CaseService;
};
