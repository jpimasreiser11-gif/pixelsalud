// Config central de contacto y marca. Un solo sitio que tocar.
// Base de despliegue sin barra final, para enlaces internos.
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export const SITE = {
  name: "PixelSalud",
  // TODO usuario: al comprar el dominio, cambiar por https://pixelsalud.es
  url: "https://jpimasreiser11-gif.github.io/pixelsalud",
  tagline: "Webs que llenan agendas de clínicas",
  description:
    "Agencia web para clínicas y centros de salud en España. Web profesional en 72 horas, cita online y SEO local. Precio cerrado y garantía de entrega.",
  // TODO usuario: sustituir por hola@pixelsalud.es al contratar Google Workspace.
  email: "jpimasreiser11@gmail.com",
  // TODO usuario: numero WhatsApp Business en formato internacional sin +, ej. "34600111222".
  whatsapp: "",
  // TODO usuario: enlace Calendly de reunion de 15-30 min (curso, video 13).
  calendly: "",
  // TODO usuario: datos del titular para paginas legales.
  legalOwner: "",
  legalNif: "",
  legalAddress: "",
} as const;

export const whatsappUrl = (msg: string): string =>
  SITE.whatsapp
    ? `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(msg)}`
    : "";
