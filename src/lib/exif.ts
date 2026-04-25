import exifr from "exifr";

/**
 * 写真から撮影日時 (DateTimeOriginal など) を抽出する。
 *
 * File / Blob / ArrayBuffer / Uint8Array いずれも受け付ける。
 * バッファ経由で受け取れるようにしているのは、画像選択直後に一度
 * ArrayBuffer に読み切ってから利用する経路で再利用するため
 * (元 File を再度 IO 経由で読み直すと iOS Safari で NotReadableError
 *  になるケースがあるため、できるだけ File への再アクセスを避ける)。
 */
export async function extractPhotoTimestamp(
  input: File | Blob | ArrayBuffer | Uint8Array,
): Promise<Date | null> {
  try {
    const data = await exifr.parse(input, {
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
