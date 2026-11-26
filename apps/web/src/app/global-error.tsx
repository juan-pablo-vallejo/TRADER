"use client";

// The last fallback: the document's own layout threw, so nothing of it is here, not the
// language, the theme or the fonts. Both languages, the theme's colours written in, one
// action, and the error's digest (the id the server's log carries) for support.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F5F6F8",
          color: "#111827",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          padding: 16,
        }}
      >
        <title>Something went wrong · TRADER</title>
        <main style={{ maxWidth: 480, width: "100%" }}>
          <h1 style={{ fontSize: 24, lineHeight: "30px", margin: "0 0 8px" }}>
            Something went wrong.
          </h1>
          <p style={{ color: "#4B5563", margin: "0 0 4px" }}>
            Nothing was saved by the step that failed. Try again to carry on.
          </p>
          <p lang="es" style={{ color: "#4B5563", margin: "0 0 24px" }}>
            Algo salió mal. El paso que falló no guardó nada. Inténtalo de nuevo para
            seguir.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: 48,
              padding: "0 16px",
              borderRadius: 12,
              border: 0,
              background: "#2808AC",
              color: "#FFFFFF",
              font: "inherit",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again · Intentar de nuevo
          </button>
          {error.digest !== undefined && (
            <p style={{ color: "#4B5563", marginTop: 24, fontSize: 15 }}>
              Reference · Referencia: <code>{error.digest}</code>
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
