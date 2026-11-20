// The foreground location stamp. A reading
// is taken while the app is in front and kept for a short while; a capture reads the one in
// hand and never waits for another. Permission refused, a reading too old or none at all is
// a record with no location, which the server flags for the office — never a blocked clock.
import type { LaborPayload } from "@trader/api/contract";
import * as Location from "expo-location";

// How old a reading may be and still say where a tap happened.
export const LOCATION_FRESH_MS = 2 * 60_000;

type Reading = { at: number; value: NonNullable<LaborPayload["location"]> };
let last: Reading | null = null;

export function locationStamp(now: number): LaborPayload["location"] {
  return last !== null && now >= last.at && now - last.at <= LOCATION_FRESH_MS
    ? last.value
    : null;
}

// Asks once, while the app is in use only; then reads. Any failure leaves what was there.
// One request at a time: a fix that is slow to come is waited for, not asked for again.
let asking = false;
export async function refreshLocation(): Promise<void> {
  if (asking) return;
  asking = true;
  try {
    let permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) {
      permission = await Location.requestForegroundPermissionsAsync();
    }
    if (!permission.granted) {
      last = null;
      return;
    }
    const keep = (position: Location.LocationObject) => {
      last = {
        // When the reading was taken, not when it was asked for.
        at: Math.min(Date.now(), position.timestamp),
        value: {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyM: position.coords.accuracy,
        },
      };
    };
    // What the phone already knows comes back at once; a new fix can take a while, and on
    // some phones never comes indoors.
    const known = await Location.getLastKnownPositionAsync({ maxAge: LOCATION_FRESH_MS });
    if (known !== null) keep(known);
    // GPS-grade: it is asked to say a tap was at a jobsite, and a network-only reading
    // cannot — nor is there one at all on some devices.
    keep(await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }));
  } catch {
    // No reading: the next refresh tries again.
  } finally {
    asking = false;
  }
}

// Where the phone is now, asked for on purpose: the Crew tab's "Set the jobsite's location
// here". A fresh GPS-grade fix or nothing: an old or coarse reading would put the jobsite
// in the wrong place for every clock-in after. Permission is asked for if it can be.
export async function currentFix(): Promise<{ lat: number; lng: number } | null> {
  try {
    let permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) {
      permission = await Location.requestForegroundPermissionsAsync();
    }
    if (!permission.granted) return null;
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    return { lat: position.coords.latitude, lng: position.coords.longitude };
  } catch {
    return null;
  }
}
