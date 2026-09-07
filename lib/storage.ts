import { getSupabase } from "./supabase";

const BUCKET = "documents";

export type DocumentRecord = {
  id: string;
  task_id: string | null;
  filename: string;
  storage_path: string;
  mime_type: string;
  uploaded_at: string;
};

/** Uploads a file's bytes to Storage and records it, optionally linked to a task. */
export async function saveDocument(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  taskId: string | null
): Promise<DocumentRecord | null> {
  const supabase = getSupabase();
  const path = `${crypto.randomUUID()}-${filename}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: mimeType, upsert: false });

  if (uploadError) {
    console.error("Failed to upload document:", uploadError);
    return null;
  }

  const { data, error } = await supabase
    .from("documents")
    .insert({
      task_id: taskId,
      filename,
      storage_path: path,
      mime_type: mimeType,
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("Failed to record document:", error);
    return null;
  }

  return data as DocumentRecord;
}

export async function getDocumentsForTask(taskId: string): Promise<DocumentRecord[]> {
  const { data, error } = await getSupabase()
    .from("documents")
    .select("*")
    .eq("task_id", taskId)
    .order("uploaded_at", { ascending: true });

  if (error) {
    console.error("Failed to load documents for task:", error);
    return [];
  }
  return (data ?? []) as DocumentRecord[];
}

/** A temporary, private link the browser can use to view/download the file. */
export async function getDocumentUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await getSupabase()
    .storage.from(BUCKET)
    .createSignedUrl(storagePath, 60 * 10); // 10 minutes

  if (error || !data) {
    console.error("Failed to create signed URL:", error);
    return null;
  }
  return data.signedUrl;
}
