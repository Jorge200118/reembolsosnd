import { supabase } from "@/lib/supabase/client";
import { prepararArchivo } from "@/lib/files/comprimir";

export interface ArchivoSubido {
  nombre: string;
  tipo: string;
  url: string;
  path: string;
}

const BUCKET = "rnd-documentos";

// Sube archivos al bucket rnd-documentos bajo el prefijo dado (p.ej. "reembolsos"
// o "evidencias"). Comprime imágenes >200KB antes de subir. Devuelve metadata
// con la URL pública — idéntico al HTML viejo (subirArchivosSupabase).
export async function subirArchivos(files: File[], prefijo: string): Promise<ArchivoSubido[]> {
  const subidos: ArchivoSubido[] = [];
  for (const file of files) {
    const { blob, tipo, nombre } = await prepararArchivo(file);
    const fileName = `${Date.now()}_${nombre}`;
    const ruta = `${prefijo}/${fileName}`;
    const { data, error } = await supabase.storage.from(BUCKET).upload(ruta, blob, { contentType: tipo });
    if (error) {
      console.error(`Error subiendo ${fileName}:`, error);
      continue; // igual que el HTML viejo: continúa con los demás
    }
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(ruta);
    subidos.push({ nombre, tipo, url: urlData.publicUrl, path: data.path });
  }
  return subidos;
}
