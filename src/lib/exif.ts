import exifr from "exifr";
import type { Location } from "@/lib/types";

export interface PhotoMetadata {
  /** EXIF 由来の撮影日時。取れなければ null */
  timestamp: Date | null;
  /** EXIF 由来の GPS 位置情報 (latitude / longitude / altitude)。取れなければ null */
  location: Location | null;
}

/**
 * 写真から撮影日時と GPS をまとめて抽出する。
 *
 * File / Blob / ArrayBuffer / Uint8Array いずれも受け付ける。
 * バッファ経由で受け取れるようにしているのは、画像選択直後に一度
 * ArrayBuffer に読み切ってから利用する経路で再利用するため
 * (元 File を再度 IO 経由で読み直すと iOS Safari で NotReadableError
 *  になるケースがあるため、できるだけ File への再アクセスを避ける)。
 */
export async function extractPhotoMetadata(
  input: File | Blob | ArrayBuffer | Uint8Array,
): Promise<PhotoMetadata> {
  let timestamp: Date | null = null;
  let location: Location | null = null;

  try {
    const data = await exifr.parse(input, {
      pick: ["DateTimeOriginal", "CreateDate", "ModifyDate", "GPSAltitude"],
    });
    if (data) {
      const candidate =
        (data.DateTimeOriginal as Date | string | undefined) ??
        (data.CreateDate as Date | string | undefined) ??
        (data.ModifyDate as Date | string | undefined);
      if (candidate) {
        const d = candidate instanceof Date ? candidate : new Date(candidate);
        if (!isNaN(d.getTime())) timestamp = d;
      }
    }
  } catch {
    // ignore: timestamp は null のまま
  }

  try {
    // exifr.gps は北緯/西経の符号変換などを自前でやってくれる。
    const gps = await exifr.gps(input);
    if (
      gps &&
      typeof gps.latitude === "number" &&
      typeof gps.longitude === "number" &&
      Number.isFinite(gps.latitude) &&
      Number.isFinite(gps.longitude)
    ) {
      location = { latitude: gps.latitude, longitude: gps.longitude };
    }
  } catch {
    // ignore: location は null のまま
  }

  return { timestamp, location };
}
