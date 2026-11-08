"use client";

import { useEffect } from "react";
import { rememberReferralFrom } from "@/modules/referrals";

/** Remembers a referral link's code from any page it lands on (PRD §14.3). Renders nothing. */
export function ReferralCapture() {
  useEffect(() => {
    rememberReferralFrom(window.location.search);
  }, []);
  return null;
}
