import type { CurrentUser } from '@/lib/session'

/** Confidential documents: managers, the uploader, or the dossier's agent only. */
export function canAccessFile(
  user: CurrentUser,
  f: { confidential: boolean; uploadedBy: string | null },
  dossierAgentId?: string | null,
) {
  if (!f.confidential) return true
  if (user.role === 'admin' || user.role === 'responsable') return true
  return f.uploadedBy === user.id || (dossierAgentId != null && dossierAgentId === user.id)
}
