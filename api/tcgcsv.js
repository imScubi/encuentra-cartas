// Función de servidor: le pide los datos a TCGCSV (catálogo de producto sellado)
// y se los pasa a la app. Esto es necesario porque TCGCSV no permite
// que el navegador le pregunte directamente (política de seguridad de ellos, no nuestra).
export default async function handler(req, res) {
  const { path } = req.query;
  if (!path) {
    return res.status(400).json({ error: "Falta el parámetro 'path'" });
  }
  try {
    const upstream = await fetch(`https://tcgcsv.com/${path}`, {
      headers: { "User-Agent": "EncuentraCartas/1.0 (app de tiendas de TCG Monterrey)" },
    });
    const data = await upstream.json();
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: "No se pudo conectar al catálogo de producto sellado" });
  }
}
