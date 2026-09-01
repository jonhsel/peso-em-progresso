/**
 * Redimensiona e converte uma imagem para JPEG antes do upload.
 * Lado maior limitado a maxDimension; qualidade fixa em 0.85.
 * Roda inteiramente no browser (canvas), sem chamada de rede.
 */
export async function resizeImageToJpeg(
  file: File,
  maxDimension = 1600,
  quality = 0.85
): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("invalid_image"));
      el.src = objectUrl;
    });

    const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
    const width = Math.round(img.width * scale);
    const height = Math.round(img.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas_unsupported");
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    if (!blob) throw new Error("encode_failed");
    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
