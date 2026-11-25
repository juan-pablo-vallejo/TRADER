// UUIDv7 minted on the device that observed the event. Ids from
// one minter never go backwards: within one millisecond the 12 bits after the version count
// up, so the `ended` and the `started` of a job switch keep the order they were made in.
// The random bytes are handed in: the phone's come from `expo-crypto`, a test's from a seed.
type RandomBytes = (count: number) => Uint8Array;

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export function createMinter(random: RandomBytes) {
  let lastMs = -1;
  let counter = 0;
  return function uuidv7(now: number): string {
    // A clock that stepped back still mints after the last id.
    let ms = Math.max(now, lastMs);
    if (ms === lastMs) {
      counter += 1;
      if (counter > 0xfff) {
        ms += 1;
        counter = 0;
      }
    } else {
      counter = 0;
    }
    lastMs = ms;
    const bytes = new Uint8Array(16);
    bytes.set(random(8), 8);
    // 48 bits of milliseconds, by division: a bit shift would truncate to 32.
    let rest = ms;
    for (let i = 5; i >= 0; i -= 1) {
      bytes[i] = rest % 256;
      rest = Math.floor(rest / 256);
    }
    bytes[6] = 0x70 | (counter >> 8);
    bytes[7] = counter & 0xff;
    bytes[8] = 0x80 | (bytes[8]! & 0x3f);
    const h = hex(bytes);
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  };
}
