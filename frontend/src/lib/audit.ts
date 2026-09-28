/**
 * Audit vocabulary, mirroring the Prisma enums in `backend/prisma/schema.prisma`.
 *
 * These were previously PascalCase model names read straight off the wire. That
 * worked only because the values were an accident of Prisma's model naming, so
 * renaming a model silently changed the API. The enums are now explicit, and
 * the `satisfies` checks below make a backend rename a compile error here.
 */
import type { LucideIcon } from 'lucide-react';
import { FileText, Settings, TrendingUp, Upload, UserPlus, Users, Link as LinkIcon } from 'lucide-react';

export const AUDIT_ENTITY_TYPES = ['COMPANY_SETTINGS', 'MEMBER', 'CUSTOMER', 'METRIC_SNAPSHOT', 'INVITE', 'REPORT', 'SHARE_LINK'] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export const AUDIT_ACTIONS = [
  'CREATED',
  'UPDATED',
  'DELETED',
  'IMPORTED',
  'INVITED',
  'ACCEPTED',
  'REVOKED',
  'GENERATED',
  'SHARED',
  'VIEWED',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface ActivityItem {
  id: string;
  entityType: AuditEntityType;
  action: AuditAction;
  changedBy: string;
  changedAt: string;
  diff: unknown;
}

export const ENTITY_LABELS: Record<AuditEntityType, string> = {
  COMPANY_SETTINGS: 'Settings',
  MEMBER: 'Team',
  CUSTOMER: 'Customer',
  METRIC_SNAPSHOT: 'Snapshot',
  INVITE: 'Invite',
  REPORT: 'Report',
  SHARE_LINK: 'Share link',
};

export const ENTITY_ICONS: Record<AuditEntityType, LucideIcon> = {
  COMPANY_SETTINGS: Settings,
  MEMBER: Users,
  CUSTOMER: TrendingUp,
  METRIC_SNAPSHOT: TrendingUp,
  INVITE: UserPlus,
  REPORT: FileText,
  SHARE_LINK: LinkIcon,
};

/** "Invitation sent", "Team member removed" - a readable verb per action. */
export const ACTION_VERBS: Record<AuditAction, string> = {
  CREATED: 'added',
  UPDATED: 'updated',
  DELETED: 'deleted',
  IMPORTED: 'imported',
  INVITED: 'sent an invite for',
  ACCEPTED: 'accepted an invite for',
  REVOKED: 'revoked',
  GENERATED: 'generated',
  SHARED: 'shared',
  VIEWED: 'viewed',
};

export const IMPORT_ICON: LucideIcon = Upload;
