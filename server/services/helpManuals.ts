import { getSupabaseAdminClient } from '../lib/supabase.js'

const HELP_BUCKET = 'help-manuals'
const SIGNED_URL_LIFETIME_SECONDS = 60 * 60

type HelpManualRow = {
  id: string
  title_en: string
  title_zh: string
  summary_en: string
  summary_zh: string
  storage_path: string
  page_count: number
  updated_at: string
}

export class HelpManualError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HelpManualError'
  }
}

export async function listHelpManuals() {
  const { data, error } = await getSupabaseAdminClient()
    .from('help_manuals')
    .select('id,title_en,title_zh,summary_en,summary_zh,page_count,updated_at')
    .eq('is_published', true)
    .order('sort_order', { ascending: true })

  if (error) throw new HelpManualError(error.message)

  return {
    manuals: (data ?? []).map((manual) => ({
      id: manual.id,
      title: manual.title_en,
      titleZh: manual.title_zh,
      summary: manual.summary_en,
      summaryZh: manual.summary_zh,
      pages: manual.page_count,
      updatedAt: manual.updated_at,
    })),
  }
}

export async function getHelpManualAccess(manualId: string) {
  const supabase = getSupabaseAdminClient()
  const { data: manual, error: manualError } = await supabase
    .from('help_manuals')
    .select('id,title_en,storage_path,page_count,updated_at')
    .eq('id', manualId)
    .eq('is_published', true)
    .maybeSingle<HelpManualRow>()

  if (manualError) throw new HelpManualError(manualError.message)
  if (!manual) return null

  const { data, error } = await supabase.storage
    .from(HELP_BUCKET)
    .createSignedUrl(manual.storage_path, SIGNED_URL_LIFETIME_SECONDS)

  if (error || !data?.signedUrl) {
    throw new HelpManualError(error?.message ?? 'A signed manual URL could not be created.')
  }

  return {
    id: manual.id,
    title: manual.title_en,
    pages: manual.page_count,
    url: data.signedUrl,
    expiresAt: new Date(Date.now() + SIGNED_URL_LIFETIME_SECONDS * 1000).toISOString(),
    updatedAt: manual.updated_at,
  }
}

