/**
 * POST /api/notes/images
 * Uploads a note image to Supabase Storage (bucket: note-images).
 * Accepts multipart/form-data with a `file` field.
 * Returns { url } — signed URL for the uploaded image.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api/notes/images')

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']

function getExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
  }
  return map[mimeType] ?? 'bin'
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('POST /api/notes/images — unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData().catch(() => null)
    if (!formData) {
      logger.warn('POST /api/notes/images — invalid form data', { userId: user.id })
      return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
    }

    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'file field is required' }, { status: 400 })
    }

    logger.debug('POST /api/notes/images', {
      userId: user.id,
      fileSize: file.size,
      mimeType: file.type,
    })

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      logger.warn('Invalid file type', { userId: user.id, mimeType: file.type })
      return NextResponse.json(
        { error: `File type not allowed. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      logger.warn('File too large', { userId: user.id, fileSize: file.size, maxSize: MAX_FILE_SIZE })
      return NextResponse.json({ error: 'File exceeds 5MB limit' }, { status: 400 })
    }

    const ext = getExtension(file.type)
    const uuid = crypto.randomUUID()
    const storagePath = `${user.id}/${uuid}.${ext}`

    const arrayBuffer = await file.arrayBuffer()
    const { error: uploadError } = await supabase.storage
      .from('note-images')
      .upload(storagePath, arrayBuffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      logger.error('Storage upload failed', { userId: user.id, storagePath, error: uploadError.message })
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    }

    // Generate a signed URL (1 hour expiry) for the private bucket
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('note-images')
      .createSignedUrl(storagePath, 3600)

    if (signedUrlError || !signedUrlData) {
      logger.error('Signed URL generation failed', { userId: user.id, storagePath, error: signedUrlError?.message })
      return NextResponse.json({ error: 'Could not generate image URL' }, { status: 500 })
    }

    logger.info('Image uploaded', { userId: user.id, storagePath, url: signedUrlData.signedUrl })
    return NextResponse.json({ url: signedUrlData.signedUrl }, { status: 201 })

  } catch (error) {
    logger.error('POST /api/notes/images failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
