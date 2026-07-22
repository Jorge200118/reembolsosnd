import { useQuery } from "@tanstack/react-query";
import { listarSolicitudes, type FiltroSolicitudes } from "@/lib/supabase/queries/materiales";

export function useSolicitudesMaterial(f: FiltroSolicitudes) {
  return useQuery({
    // La sucursal y los estados van en la llave: si cambian, se refetchea.
    queryKey: ["materiales", f.sucursal, ...f.estados],
    queryFn: () => listarSolicitudes(f),
  });
}
