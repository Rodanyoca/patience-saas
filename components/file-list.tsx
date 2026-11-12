import { desc, eq } from 'drizzle-orm'
import { Download, Eye, FileText, Lock, Trash2, Upload } from 'lucide-react'
import { db } from '@/lib/db'
import { dossiers, files } from '@/lib/db/schema'
import type { CurrentUser } from '@/lib/session'
import { canAccessFile } from '@/lib/file-access'
import { deleteFile, uploadFile } from '@/app/actions/files'
import { ActionButton, CheckboxField, Field, FormDialog, FormGrid, SelectField } from '@/components/forms'
import { EmptyState, Panel, Pill, RefTag } from '@/components/shared'
import { FILE_CATEGORIES } from '@/lib/constants'
import { formatDate } from '@/lib/format'

export function formatSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`
}

export function UploadDialog({ clientId, dossierId }: { clientId?: number; dossierId?: number }) {
  return (
    <FormDialog
      title="Ajouter un document"
      description="PDF, image, Word ou Excel — 10 Mo maximum. Stockage privé."
      trigger={
        <>
          <Upload /> Ajouter
        </>
      }
      triggerVariant="outline"
      triggerSize="sm"
      action={uploadFile}
      submitLabel="Téléverser"
      success="Document ajouté"
    >
      {clientId && <input type="hidden" name="clientId" value={clientId} />}
      {dossierId && <input type="hidden" name="dossierId" value={dossierId} />}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="f-file" className="text-xs font-medium text-muted-foreground">
          Fichier <span className="text-destructive">*</span>
        </label>
        <input
          id="f-file"
          name="file"
          type="file"
          required
          accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx,.xls,.xlsx"
          className="text-sm file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
        />
      </div>
      <FormGrid>
        <SelectField label="Catégorie" name="category" options={FILE_CATEGORIES} defaultValue="passeport" />
        <Field label="Libellé (facultatif)" name="name" placeholder="Ex. Passeport – Awa" />
      </FormGrid>
      <CheckboxField label="Document confidentiel (accès restreint aux responsables et à l’agent du dossier)" name="confidential" />
    </FormDialog>
  )
}

export async function FileList({
  user,
  clientId,
  dossierId,
  agentId,
}: {
  user: CurrentUser
  clientId?: number
  dossierId?: number
  agentId?: string | null
}) {
  const rows = await db
    .select({ f: files, dossierRef: dossiers.reference, agentId: dossiers.agentId })
    .from(files)
    .leftJoin(dossiers, eq(dossiers.id, files.dossierId))
    .where(dossierId ? eq(files.dossierId, dossierId) : eq(files.clientId, clientId!))
    .orderBy(desc(files.createdAt))

  return (
    <Panel
      title={`Documents (${rows.length})`}
      actions={<UploadDialog clientId={dossierId ? undefined : clientId} dossierId={dossierId} />}
    >
      {rows.length === 0 ? (
        <EmptyState title="Aucun document">
          Passeports, billets, confirmations d’hôtel, attestations d’assurance et pièces justificatives.
        </EmptyState>
      ) : (
        <ul className="divide-y">
          {rows.map(({ f, dossierRef, agentId: rowAgent }) => {
            const allowed = canAccessFile(user, f, agentId ?? rowAgent)
            return (
              <li key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                  {f.confidential ? <Lock className="size-4" /> : <FileText className="size-4" />}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{f.name}</span>
                  <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    {FILE_CATEGORIES[f.category as keyof typeof FILE_CATEGORIES]} · {formatDate(f.createdAt)} · {f.uploadedByName}
                    {f.size ? ` · ${formatSize(f.size)}` : ''}
                  </span>
                </div>
                {!dossierId && dossierRef && <RefTag href={`/dossiers/${f.dossierId}?tab=documents`}>{dossierRef}</RefTag>}
                {f.confidential && <Pill tone="accent">Confidentiel</Pill>}
                {allowed ? (
                  <div className="flex items-center gap-1">
                    <a
                      href={`/api/files/${f.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={`Consulter ${f.name}`}
                    >
                      <Eye className="size-4" />
                    </a>
                    <a
                      href={`/api/files/${f.id}?download=1`}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={`Télécharger ${f.name}`}
                    >
                      <Download className="size-4" />
                    </a>
                    {(user.role !== 'agent' || f.uploadedBy === user.id) && (
                      <ActionButton
                        action={deleteFile.bind(null, f.id)}
                        confirm="Supprimer définitivement ce document ?"
                        variant="ghost"
                        size="icon-sm"
                        success="Document supprimé"
                      >
                        <Trash2 />
                        <span className="sr-only">Supprimer</span>
                      </ActionButton>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">Accès restreint</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
