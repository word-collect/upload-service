import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { v4 as uuidv4 } from 'uuid'

const s3 = new S3Client({})

export const handler = async (event: any) => {
  const sub = (event.requestContext.authorizer!.jwt as any).claims.sub as string

  // accept  { "url": "https://…" }  in the POST body
  const { url } = JSON.parse(event.body ?? '{}')
  if (!url) return { statusCode: 400, body: 'Missing "url" in body' }

  // ---- 1. Download the HTML ------------------------------------------------
  const r = await fetch(url, {
    redirect: 'follow',
    headers: {
      // Pretend to be Chrome on Windows – any modern UA works
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      // These two aren’t strictly required but help some WAF rules
      'Accept-Language': 'en-US,en;q=0.9',
      Accept: 'text/html,application/xhtml+xml'
    }
  })
  if (!r.ok) {
    return { statusCode: 400, body: `Could not fetch (${r.status})` }
  }
  const html = await r.text()
  const contentType = r.headers.get('content-type') ?? 'text/html'

  // ---- 2. Put it into the uploads bucket under  raw/<sub>/….
  const key = `raw/${sub}/${uuidv4()}.html`
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.BUCKET_NAME!,
      Key: key,
      Body: html,
      ContentType: contentType
    })
  )

  // 201 CREATED keeps the API symmetric with the signed-URL path
  return {
    statusCode: 201,
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ key })
  }
}
