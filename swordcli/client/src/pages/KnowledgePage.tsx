import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, FileText, Loader2, Search, Trash2, Upload } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  ACCEPTED_DOC_TYPES, MAX_UPLOAD_BYTES, addKnowledgeDoc, deleteKnowledgeDoc,
  isAcceptedDoc, listKnowledgeDocs, searchKnowledge, type KnowledgeDoc,
} from '@/lib/knowledge'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export default function KnowledgePage() {
  const qc = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [searched, setSearched] = useState('')
  const [skipped, setSkipped] = useState<string[]>([])

  const docs = useQuery({ queryKey: ['rag-docs'], queryFn: listKnowledgeDocs })

  const upload = useMutation({
    mutationFn: addKnowledgeDoc,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rag-docs'] }),
  })

  const remove = useMutation({
    mutationFn: deleteKnowledgeDoc,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rag-docs'] }),
  })

  const search = useMutation({
    mutationFn: (q: string) => searchKnowledge(q, 6),
    onSuccess: (_data, q) => setSearched(q),
  })

  const items: KnowledgeDoc[] = docs.data?.documents ?? []
  const totals = items.reduce(
    (acc, d) => ({ chunks: acc.chunks + d.chunks, bytes: acc.bytes + d.size }),
    { chunks: 0, bytes: 0 },
  )

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    const rejected: string[] = []
    // Sequential: one large PDF at a time keeps peak memory predictable, and lets
    // us report per-file failures instead of failing the whole batch.
    for (const file of files) {
      if (!isAcceptedDoc(file.name)) {
        rejected.push(`${file.name} (only .pdf and .md)`)
        continue
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        rejected.push(`${file.name} (over ${formatBytes(MAX_UPLOAD_BYTES)})`)
        continue
      }
      try {
        await upload.mutateAsync(file)
      } catch (err) {
        rejected.push(`${file.name} (${(err as Error).message})`)
      }
    }
    setSkipped(rejected)
  }

  const hits = search.data?.hits ?? []

  return (
    <div>
      <PageHeader
        title="Knowledge Library"
        description="Reference material the agent can search. PDF and Markdown only."
      />

      <div className="space-y-8">
        {/* Upload */}
        <section className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPTED_DOC_TYPES}
              multiple
              className="hidden"
              onChange={onPick}
            />
            <Button onClick={() => fileInput.current?.click()} disabled={upload.isPending}>
              {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Add documents
            </Button>
            <span className="text-sm text-muted-foreground">
              PDF or Markdown, up to {formatBytes(MAX_UPLOAD_BYTES)} each.
            </span>
          </div>
          {skipped.length > 0 && (
            <p className="text-sm text-amber-600">Skipped {skipped.join(' · ')}</p>
          )}
        </section>

        {/* Library */}
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <BookOpen className="h-4 w-4" />
            <span>
              {items.length} document{items.length === 1 ? '' : 's'} · {totals.chunks} chunks ·{' '}
              {formatBytes(totals.bytes)}
            </span>
          </div>

          {docs.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading library…</p>
          ) : docs.isError ? (
            <p className="text-sm text-destructive">{(docs.error as Error).message}</p>
          ) : items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Nothing indexed yet. Add a PDF or Markdown file and it becomes searchable immediately.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {items.map(doc => (
                <li key={doc.id} className="flex items-center gap-3 p-3">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.chunks} chunk{doc.chunks === 1 ? '' : 's'} · {formatBytes(doc.size)} ·{' '}
                      {new Date(doc.uploadedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant="secondary">{doc.ext}</Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${doc.name}`}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(doc.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {remove.isError && (
            <p className="text-sm text-destructive">{(remove.error as Error).message}</p>
          )}
        </section>

        {/* Retrieval check */}
        <section className="rounded-lg border border-border p-4 space-y-3">
          <p className="text-sm font-medium">Test retrieval</p>
          <form
            className="flex gap-2"
            onSubmit={e => {
              e.preventDefault()
              if (query.trim()) search.mutate(query.trim())
            }}
          >
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Ask the library a question…"
              aria-label="Search the knowledge library"
            />
            <Button type="submit" disabled={search.isPending || !query.trim()}>
              {search.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Search
            </Button>
          </form>

          {search.isError && (
            <p className="text-sm text-destructive">{(search.error as Error).message}</p>
          )}

          {searched && !search.isPending && !search.isError && (
            hits.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No match for “{searched}”. The library only answers from what you have added.
              </p>
            ) : (
              <div className="space-y-2">
                {hits.map(hit => (
                  <div key={hit.chunkId} className="rounded-md border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{hit.docName}</span>
                      <span>score {hit.finalScore.toFixed(3)}</span>
                      <span>bm25 {hit.bm25Score.toFixed(2)}</span>
                      <span>semantic {hit.embeddingScore.toFixed(2)}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
                      {hit.text.length > 400 ? `${hit.text.slice(0, 400)}…` : hit.text}
                    </p>
                  </div>
                ))}
              </div>
            )
          )}
        </section>
      </div>
    </div>
  )
}