export type OrgType = "funeral_home" | "crematory";
export type MemberRole = "admin" | "associate";

export type Organization = {
  id: string;
  org_type: OrgType;
  name: string;
  phone: string | null;
  address: string | null;
  created_at: string;
};

export type OrgMember = {
  id: string;
  org_id: string;
  user_id: string;
  email: string;
  name: string;
  role: MemberRole;
  active: boolean;
};

export type OrgRoleForUser = {
  org_id: string;
  org_type: OrgType;
  role: MemberRole;
  email: string;
  name: string;
};

export type BootstrapOrgInput = {
  userId: string;
  email: string;
  name: string;
  orgType: OrgType;
  orgName: string;
  phone?: string;
  address?: string;
};
