// WhatsApp's own logo, the inline one (glyph and wordmark), where a control opens a WhatsApp
// chat. The files are the official ones from WhatsApp's brand resources (Meta's WhatsApp
// brand page, read 2026-11-26), unchanged: green on white, white on navy. The logo is never
// the word in a sentence and never the page's most prominent thing; the control's own words
// are kept for a screen reader.
/* eslint-disable @next/next/no-img-element -- a small static mark; next/image would write an
   inline style the content security policy refuses, as for Google's mark on sign-in. */
export function WhatsAppMark({
  label,
  tone = "green",
  height = 22,
}: {
  label: string;
  tone?: "green" | "white";
  height?: number;
}) {
  // The file's own proportions: 1487 by 346.
  const width = Math.round((height * 1487.13) / 346);
  return (
    <>
      <img
        src={`/brand/whatsapp-inline-${tone}.svg`}
        alt=""
        width={width}
        height={height}
      />
      <span className="visually-hidden">{label}</span>
    </>
  );
}
