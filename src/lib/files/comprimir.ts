// Compresión de imágenes idéntica al HTML viejo (V4, L2365-2418):
// solo imágenes > 200KB se comprimen a JPEG 30%, reescaladas a maxWidth 1200.
// PDFs y archivos pequeños se suben tal cual.

export const UMBRAL_COMPRESION = 200_000;

export function debeComprimir(tipo: string, tamano: number): boolean {
  return tipo.startsWith("image/") && tamano > UMBRAL_COMPRESION;
}

// Comprime un File imagen a un Blob JPEG (calidad 0.3, maxWidth 1200) usando canvas.
// Idéntico a comprimirImagen() del HTML viejo.
export function comprimirImagen(file: File, calidad = 0.3, maxWidth = 1200): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) { reject(new Error("No canvas 2d context")); return; }
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => { if (blob) resolve(blob); else reject(new Error("toBlob devolvió null")); },
        "image/jpeg",
        calidad,
      );
    };
    img.onerror = () => reject(new Error("No se pudo cargar la imagen"));
    img.src = URL.createObjectURL(file);
  });
}

// Devuelve el Blob a subir: comprimido si aplica, o el File original.
export async function prepararArchivo(file: File): Promise<{ blob: Blob; tipo: string; nombre: string }> {
  if (debeComprimir(file.type, file.size)) {
    const blob = await comprimirImagen(file, 0.3, 1200);
    return { blob, tipo: "image/jpeg", nombre: file.name };
  }
  return { blob: file, tipo: file.type, nombre: file.name };
}
