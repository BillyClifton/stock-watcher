import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({});
const BUCKET = process.env.DOCS_BUCKET;

export async function putObject(key, body, contentType) {
  return s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType
  }));
}