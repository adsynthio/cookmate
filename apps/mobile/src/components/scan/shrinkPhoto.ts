// A phone photo made small enough to send for reading, for the scan screen and the kitchen step of setup.
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { Platform } from "react-native";

/** Long edge of the photo sent for reading: sharp enough for a bill, small enough to send quickly. */
export const SEND_EDGE = 1600;

/**
 * The photo as a small JPEG (base64). It is decoded straight to that size, so a 12–48 MP phone photo is never held at
 * full size: the web app used to copy it whole onto a canvas and resize it in JavaScript, which an iPhone can't hold,
 * and the photo was never read.
 */
export async function shrinkPhoto(uri: string): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri, { maxWidth: SEND_EDGE, maxHeight: SEND_EDGE });
  try {
    const image = await ctx.renderAsync();
    try {
      const small = await image.saveAsync({ compress: 0.6, format: SaveFormat.JPEG, base64: true });
      if (Platform.OS === "web") URL.revokeObjectURL(small.uri);
      if (!small.base64) throw new Error("The smaller photo came out empty");
      return small.base64;
    } finally {
      image.release();
    }
  } finally {
    ctx.release();
    // Web: the picked photo is a file held in memory by its blob: address until let go.
    if (Platform.OS === "web" && uri.startsWith("blob:")) URL.revokeObjectURL(uri);
  }
}
