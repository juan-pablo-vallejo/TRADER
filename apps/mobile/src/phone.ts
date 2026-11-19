// A sign-in number as the roster holds it: E.164, `+1` and
// ten digits. People type it with spaces, dashes, brackets, with or without the 1.
export function signInPhone(typed: string): string | null {
  const digits = typed.replace(/[\s().-]/g, "");
  const national = /^\+1\d{10}$/.test(digits)
    ? digits.slice(2)
    : /^1\d{10}$/.test(digits)
      ? digits.slice(1)
      : /^\d{10}$/.test(digits)
        ? digits
        : null;
  // A North American number's area code and exchange never begin with 0 or 1.
  return national !== null && /^[2-9]\d{2}[2-9]\d{6}$/.test(national)
    ? `+1${national}`
    : null;
}
