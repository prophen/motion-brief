import { useState } from 'react'
import {
  useAuthProfileReady,
  useMutations,
  useQuery,
  useR2Files,
} from 'deepspace'
import { FileText, FolderOpen, Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  Badge,
  Button,
  buttonVariants,
  EmptyState,
  useToast,
} from '../../components/ui'
import {
  displayedProjectStatus,
  type MotionProject,
} from '../../lib/motion-project'
import { projectAssetKeys } from '../../lib/assets'

const statusLabel: Record<MotionProject['status'], string> = {
  draft: 'Draft',
  ready: 'In progress',
  rendering: 'Rendering',
  complete: 'Complete',
}

export default function ProjectsPage() {
  const { isSignedIn } = useAuthProfileReady({ requireUser: true })
  const { records, status } = useQuery<MotionProject>('motion-projects', {
    orderBy: 'updatedAt',
    orderDir: 'desc',
    limit: 100,
  })
  const { removeConfirmed, ready } =
    useMutations<MotionProject>('motion-projects')
  const { deleteFile } = useR2Files({ scope: 'app' })
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const toast = useToast()

  async function removeProject(
    recordId: string,
    title: string,
    assetManifest: string,
  ) {
    const assetKeys = projectAssetKeys(assetManifest, recordId)
    const mediaDescription =
      assetKeys.length === 0
        ? 'This permanently deletes the project record.'
        : `This permanently deletes the project and ${assetKeys.length} stored media ${assetKeys.length === 1 ? 'file' : 'files'}. Previously copied media links will stop working.`
    if (
      !window.confirm(
        `Delete “${title || 'Untitled creative brief'}”?\n\n${mediaDescription}`,
      )
    )
      return
    setDeletingId(recordId)
    try {
      const deletionResults = await Promise.all(
        assetKeys.map((key) => deleteFile(key)),
      )
      const failedDeletion = deletionResults.find((result) => !result.success)
      if (failedDeletion) {
        throw new Error(
          failedDeletion.error ||
            'One or more media files could not be deleted. Please try again.',
        )
      }
      await removeConfirmed(recordId)
      toast.success(
        'Project deleted',
        assetKeys.length === 0
          ? 'The creative brief was removed from your projects.'
          : 'The creative brief and its stored media were permanently deleted.',
      )
    } catch (error) {
      toast.error(
        'Could not delete project',
        error instanceof Error ? error.message : 'Please try again.',
      )
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="min-h-full bg-background px-5 py-8 text-foreground md:px-9 md:py-12">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[.22em] text-primary">
              Your workspace
            </p>
            <h1 className="text-3xl font-semibold tracking-[-.04em] md:text-5xl">
              Creative projects
            </h1>
            <p className="mt-3 max-w-xl text-muted-foreground">
              Open an existing concept or start a fresh brief. Every project is
              saved separately to your account.
            </p>
          </div>
          <Link className={buttonVariants()} to="/home?new=1">
            <Plus />
            New project
          </Link>
        </header>

        {!isSignedIn ? (
          <EmptyState
            className="mt-10 rounded-2xl border border-border bg-card"
            icon={<FolderOpen />}
            title="Sign in to view projects"
            description="Your saved MotionBrief projects are private to your account."
          />
        ) : status === 'loading' ? (
          <div
            className="grid gap-4 py-8 sm:grid-cols-2 lg:grid-cols-3"
            aria-label="Loading projects"
          >
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-44 animate-pulse rounded-2xl border border-border bg-card"
              />
            ))}
          </div>
        ) : records.length === 0 ? (
          <EmptyState
            className="mt-10 rounded-2xl border border-border bg-card"
            icon={<FileText />}
            title="No projects yet"
            description="Start with one creator prompt and build your first campaign concept."
            action={{
              label: 'Create a project',
              onClick: () => {
                window.location.href = '/home?new=1'
              },
            }}
          />
        ) : (
          <div className="grid gap-4 py-8 sm:grid-cols-2 lg:grid-cols-3">
            {records.map((record) => {
              const status = displayedProjectStatus(record.data)
              return (
                <article
                  key={record.recordId}
                  className="flex min-h-48 flex-col rounded-2xl border border-border bg-card p-5 shadow-[0_12px_45px_rgba(0,0,0,.14)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <Badge
                      variant={status === 'complete' ? 'success' : 'outline'}
                    >
                      {statusLabel[status] ?? 'Draft'}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${record.data.title || 'project'}`}
                      loading={deletingId === record.recordId}
                      disabled={!ready || deletingId !== null}
                      onClick={() =>
                        removeProject(
                          record.recordId,
                          record.data.title,
                          record.data.assetManifest,
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <h2 className="mt-5 line-clamp-2 text-xl font-semibold tracking-[-.025em]">
                    {record.data.title || 'Untitled creative brief'}
                  </h2>
                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                    {record.data.prompt || 'No creator prompt yet.'}
                  </p>
                  <Link
                    className={buttonVariants({
                      variant: 'outline',
                      className: 'mt-auto pt-2',
                    })}
                    to={`/home?project=${encodeURIComponent(record.recordId)}`}
                  >
                    <FolderOpen />
                    Open project
                  </Link>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
