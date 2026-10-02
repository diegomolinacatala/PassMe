"use client";

import { MapPin, Phone, Video } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import type { MeetingFormat } from "@/lib/meetings/schema";

export const FORMAT_ICONS: Record<MeetingFormat, typeof MapPin> = { in_person: MapPin, video: Video, phone: Phone };

const noSubscription = () => () => {};

/**
 * The browser's clock when this component mounted; 0 while rendering on the
 * server (and during hydration), so time-dependent UI never mismatches.
 */
export function useClientNow(): number {
  const isClient = useSyncExternalStore(noSubscription, () => true, () => false);
  const [mountedAt] = useState(() => Date.now());
  return isClient ? mountedAt : 0;
}
