"use client";

import { useTranslations } from "next-intl";
import type { UserStatusCode } from "@/core/domain/entities/account";
import type { CourierVerificationCode } from "@/core/domain/entities/staff";
import { Badge, type BadgeTone } from "../ui/Badge";

const VERIFICATION_TONE: Record<CourierVerificationCode, BadgeTone> = {
  PENDING: "warning",
  VERIFIED: "success",
  SUSPENDED: "danger",
  REJECTED: "neutral",
};

const ACCOUNT_TONE: Record<UserStatusCode, BadgeTone> = {
  ACTIVE: "success",
  SUSPENDED: "warning",
  DEACTIVATED: "danger",
  CLOSED: "neutral",
};

export function VerificationBadge({ status }: { status: CourierVerificationCode }) {
  const t = useTranslations("verification");
  return (
    <Badge tone={VERIFICATION_TONE[status]} dot>
      {t(status)}
    </Badge>
  );
}

export function AccountStatusBadge({ status }: { status: UserStatusCode }) {
  const t = useTranslations("accountStatus");
  return (
    <Badge tone={ACCOUNT_TONE[status]} dot>
      {t(status)}
    </Badge>
  );
}
