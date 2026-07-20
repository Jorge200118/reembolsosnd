import { redirect } from "next/navigation";

// La raíz "/" no tiene contenido propio: es solo un punto de entrada.
// El middleware ya manda a /login a quien no tiene sesión; aquí cerramos el
// caso de quien SÍ está logueado enviándolo al dashboard. Así "/" nunca
// renderiza una página en blanco (antes mostraba la plantilla de Next).
export default function Home() {
  redirect("/dashboard");
}
