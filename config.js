// Configuración de servicios externos (Supabase y páginas de Netlify).
// La clave "publishable" de Supabase está pensada para usarse en apps cliente.
// Reemplazá las URL de Netlify por las de tu sitio real (ver README, sección 5).
module.exports = {
  SUPABASE_URL: 'https://xkzohictfqvdrvqyqdco.supabase.co',
  SUPABASE_KEY: 'sb_publishable_AEQU-r4Q6y9sSCGT-smaOw_XvR17a-I',
  // Página del teléfono (la que abre el código QR).
  PHONE_LOGIN_URL: 'https://regedit-ayudanavegadore.netlify.app/',
  // Dirección a la que vuelven Google/GitHub tras autorizar. La ventana del navegador
  // la intercepta, así que no hace falta que exista una página en esa dirección.
  // Google/GitHub vuelven a esta dirección de la app (esquema propio). Hay que agregarla en Supabase → Redirect URLs.
  AUTH_CALLBACK_URL: 'facuedu://auth',
  // Documento de ayuda (Google Docs). Tiene que estar compartido como "cualquier persona con el enlace".
  HELP_URL: 'https://docs.google.com/document/d/1CypbPzP612gNo5YuhG0Zq2c3h1Muc4_edpK55Gehvnk/edit',
};
