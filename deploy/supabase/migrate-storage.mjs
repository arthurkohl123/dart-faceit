import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function readEnvValue(path, name) {
  const expression = new RegExp(`^${name}=(.*)$`, 'm');
  const match = readFileSync(path, 'utf8').match(expression);
  if (!match?.[1]) throw new Error(`Missing ${name} in ${path}`);

  const value = match[1].trim();
  return (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))
    ? value.slice(1, -1)
    : value;
}

async function listFiles(client, bucketName, prefix = '') {
  const { data, error } = await client.storage.from(bucketName).list(prefix, { limit: 1000 });
  if (error) throw new Error(`Unable to list objects in ${bucketName}: ${error.message}`);

  const files = [];
  for (const item of data ?? []) {
    const path = `${prefix}${item.name}`;
    if (item.metadata) files.push({ path, metadata: item.metadata });
    else files.push(...await listFiles(client, bucketName, `${path}/`));
  }
  return files;
}

const sourceUrl = readEnvValue(process.env.SOURCE_ENV_PATH, 'NEXT_PUBLIC_SUPABASE_URL');
const sourceKey = readEnvValue(process.env.SOURCE_ENV_PATH, 'SUPABASE_SERVICE_ROLE_KEY');
const targetUrl = process.env.TARGET_SUPABASE_URL;
const targetKey = readEnvValue(process.env.TARGET_ENV_PATH, 'SERVICE_ROLE_KEY');

if (!targetUrl) throw new Error('Missing TARGET_SUPABASE_URL');

const source = createClient(sourceUrl, sourceKey, { auth: { persistSession: false } });
const target = createClient(targetUrl, targetKey, { auth: { persistSession: false } });
const { data: buckets, error: bucketsError } = await source.storage.listBuckets();
if (bucketsError) throw new Error(`Unable to list source buckets: ${bucketsError.message}`);

let copied = 0;
let failed = 0;

for (const bucket of buckets ?? []) {
  const { data: targetBucket, error: targetBucketError } = await target.storage.getBucket(bucket.name);
  if (targetBucketError && !/not found/i.test(targetBucketError.message)) {
    throw new Error(`Unable to inspect target bucket ${bucket.name}: ${targetBucketError.message}`);
  }

  if (!targetBucket) {
    const { error } = await target.storage.createBucket(bucket.name, {
      public: bucket.public,
      fileSizeLimit: bucket.file_size_limit,
      allowedMimeTypes: bucket.allowed_mime_types,
    });
    if (error) throw new Error(`Unable to create target bucket ${bucket.name}: ${error.message}`);
  }

  const files = await listFiles(source, bucket.name);
  for (const file of files) {
    try {
      const { data, error: downloadError } = await source.storage.from(bucket.name).download(file.path);
      if (downloadError) throw downloadError;

      const { error: uploadError } = await target.storage.from(bucket.name).upload(file.path, data, {
        upsert: true,
        contentType: file.metadata.mimetype,
        cacheControl: String(file.metadata.cacheControl ?? '3600'),
      });
      if (uploadError) throw uploadError;
      copied += 1;
    } catch {
      failed += 1;
    }
  }
}

console.log(JSON.stringify({ buckets: buckets?.length ?? 0, copied, failed }));
if (failed > 0) process.exitCode = 1;
