// src/requestUploadUrl.ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { v4 as uuidv4 } from 'uuid'

const s3 = new S3Client({})

export const handler = async () => {
  const key = `raw/${uuidv4()}`
  const command = new PutObjectCommand({
    Bucket: process.env.BUCKET_NAME!,
    Key: key,
    ContentType: 'application/octet-stream'
  })
  const url = await getSignedUrl(s3, command, {
    expiresIn: Number(process.env.URL_EXPIRY ?? '900')
  })

  return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': '*' }, // basic CORS
    body: JSON.stringify({ url, key })
  }
}
