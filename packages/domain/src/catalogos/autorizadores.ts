// Fuente: <select id="quienAutoriza"> en el HTML viejo (~L1147-1174).
// Se excluye el placeholder "-- Seleccione quien autoriza --" (value="").
export const AUTORIZADORES = [
  "Alejandra Zepeda",
  "Andrés Salazar",
  "Cristina Valadez",
  "David Ramírez",
  "Diana Gpe. Rivera Ortega",
  "Flor Santos",
  "Francisco Armenta",
  "Gisela Armenta",
  "Gmo. Tostado",
  "Guillermo Corrales Cruz",
  "Hugo Andrés Salazar Osorio",
  "Ing Javier Pinedo",
  "Jasive Trasviña",
  "José Urías",
  "Karla Ochoa",
  "Lic Ana Maria",
  "Lic Diana Soto",
  "Lic Fernando Balderrama",
  "Lic Fernando Olais",
  "Lic Jose Balderrama",
  "Luis Adrian Monroy Torres",
  "Rosa María De Balderrama",
  "Socorro Isela Valdez Ruiz",
  "Felipe Reyes Cota",
  "Victor Hugo Diaz Navarro",
] as const;

export type Autorizador = (typeof AUTORIZADORES)[number];
