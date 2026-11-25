// A WhatsApp chat with a number, as both apps open it: `https://wa.me/<digits>`, the number
// in full international form, digits only, and `?text=` for a ready message (WhatsApp Help
// Center, "How to use click to chat", read 2026-11-24). A number is typed by people: one
// with no country code, ten digits, is read as a United States number; an extension after
// it is dropped. Null for what holds no number. Pure. Part of the client-safe contract.

export function whatsAppLink(phone: string | null, text?: string): string | null {
  if (phone === null) return null;
  const main = phone.replace(/\s*(?:ext\.?|extension|x)\s*\d+\s*$/i, "");
  const start = main.search(/[+\d]/);
  if (start === -1) return null;
  const international = main[start] === "+";
  let digits = main.replace(/\D/g, "");
  if (!international && digits.length === 10) digits = `1${digits}`;
  if (digits.length < 8 || digits.length > 15) return null;
  return `https://wa.me/${digits}${text === undefined ? "" : `?text=${encodeURIComponent(text)}`}`;
}
