import exifr from "exifr";

/**
 * 写真ファイルから撮影日時 (DateTimeOriginal など) を抽出する。
 * 取得できない場合は null。
 */
export async function extractPhotoTimestamp(file: File): Promise<Date | null> {
  try {
    const data = await exifr.parse(file, {
      pick: ["DateTimeOriginal", "CreateDate", "ModifyDate"],
    });
    if (!data) return null;
    const candidate =
      (data.DateTimeOriginal as Date | string | undefined) ??
      (data.CreateDate as Date | string | undefined) ??
      (data.ModifyDate as Date | string | undefined);
    if (!candidate) return null;
    const d = candidate instanceof Date ? candidate : new Date(candidate);
    if (isNaN(d.getTime())) return null;
    return d;
  } catch {
    return null;
  }
}
