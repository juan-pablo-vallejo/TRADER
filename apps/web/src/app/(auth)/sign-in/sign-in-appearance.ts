// How Clerk's own sign-in form is drawn on D'Sierra's brand: their red for its one main
// button, their navy for its heading, links and focus ring, Bodoni Moda for the heading
// and Inter's Latin cut for the rest ((auth)/auth.module.css is the page around it). The
// form is Clerk's prebuilt one and is never rebuilt: only its `appearance` is set.
//
// Every color is a literal, and a test holds each to its token in theme.css
// (test/theme.test.ts). Clerk derives a button's shades from the value it is given and
// cannot from a CSS variable (the button drew blank), and its country list is drawn at
// the end of the document, outside the `data-brand` root, where a brand token is not
// defined at all.
import type { SignIn } from "@clerk/nextjs";
import type { ComponentProps } from "react";

export const SIGN_IN_COLORS = {
  red600: "#bc0c0c",
  red700: "#9a0a0a",
  red800: "#7c0808",
  navy700: "#140064",
  ink: "#111827",
  inkSecondary: "#4b5563",
  controlBorder: "#8a93a2",
  problemInk: "#991b1b",
  surface: "#ffffff",
} as const;

const c = SIGN_IN_COLORS;
const text = '"Inter Latin", system-ui, sans-serif';
const display = '"Bodoni Moda", Georgia, "Times New Roman", serif';
// A text link is 48 px tall, for a thumb.
const link = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: "48px",
  color: c.navy700,
  fontSize: "15px",
  fontWeight: 600,
};

export const signInAppearance: NonNullable<ComponentProps<typeof SignIn>["appearance"]> =
  {
    // Clerk's plain base: its default one draws a sheen and a shadow on the button, and
    // the homepage's Call is flat.
    theme: "simple",
    // No logo: the page's navy carries their mark. No card: the form is the page.
    options: { logoPlacement: "none", elevation: "flush" },
    variables: {
      colorPrimary: c.red600,
      colorPrimaryForeground: c.surface,
      colorForeground: c.ink,
      colorMutedForeground: c.inkSecondary,
      colorDanger: c.problemInk,
      colorRing: c.navy700,
      colorBackground: c.surface,
      colorInput: c.surface,
      colorInputForeground: c.ink,
      fontFamily: text,
      fontFamilyButtons: text,
      fontSize: "1.0625rem",
      borderRadius: "8px",
    },
    elements: {
      rootBox: { width: "100%" },
      cardBox: { width: "100%", maxWidth: "100%" },
      header: { alignItems: "flex-start", textAlign: "left" },
      // The step's heading is the page's: 40/44, as auth.module.css draws its stand-in.
      headerTitle: {
        color: c.navy700,
        fontFamily: display,
        fontSize: "40px",
        fontWeight: 700,
        lineHeight: "44px",
        letterSpacing: "-0.01em",
        textAlign: "left",
      },
      headerSubtitle: {
        color: c.inkSecondary,
        fontSize: "17px",
        lineHeight: "26px",
        textAlign: "left",
      },
      formFieldLabelRow: { alignItems: "center" },
      formFieldLabel: { color: c.ink, fontSize: "15px", fontWeight: 600 },
      formFieldAction: link,
      // 52 px to press, and 18 px text: under 16 px an iPhone zooms the page on focus.
      formFieldInput: {
        minHeight: "52px",
        fontSize: "18px",
        borderColor: c.controlBorder,
      },
      phoneInputBox: { minHeight: "52px", borderColor: c.controlBorder },
      otpCodeFieldInput: {
        width: "48px",
        height: "56px",
        minHeight: "56px",
        fontSize: "24px",
        borderColor: c.controlBorder,
      },
      // Their red, with no arrow after the word.
      formButtonPrimary: {
        minHeight: "52px",
        backgroundColor: c.red600,
        color: c.surface,
        fontSize: "18px",
        fontWeight: 600,
        "&:hover": { backgroundColor: c.red700 },
        "&:active": { backgroundColor: c.red800 },
        "&:focus-visible": {
          boxShadow: `0 0 0 2px ${c.surface}, 0 0 0 4px ${c.navy700}`,
        },
      },
      buttonArrowIcon: { display: "none" },
      // The code step, set to the left edge as the heading is: Clerk centers it.
      identityPreview: {
        justifyContent: "flex-start",
        marginInline: 0,
        paddingInline: 0,
      },
      otpCodeField: { alignSelf: "flex-start" },
      formResendCodeLink: {
        ...link,
        alignSelf: "flex-start",
        justifyContent: "flex-start",
      },
      footerActionLink: link,
      backLink: link,
      identityPreviewEditButton: {
        minWidth: "48px",
        minHeight: "48px",
        color: c.navy700,
      },
      alternativeMethodsBlockButton: { minHeight: "52px", fontSize: "17px" },
      formFieldErrorText: { color: c.problemInk, fontSize: "15px" },
      otpCodeFieldErrorText: { color: c.problemInk, fontSize: "15px" },
    },
  };
