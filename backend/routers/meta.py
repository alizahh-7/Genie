from fastapi import APIRouter

import notices

router = APIRouter(prefix="/meta", tags=["meta"])


@router.get("/notices")
def get_notices():
    return {
        "disclaimer": notices.DISCLAIMER,
        "sample_label": notices.SAMPLE_LABEL,
        "source_labels": notices.SOURCE_LABELS,
        "match_basis_labels": notices.MATCH_BASIS_LABELS,
        "verification_plan": notices.VERIFICATION_PLAN,
        "privacy_points": notices.PRIVACY_POINTS,
        "retention_days": list(notices.RETENTION_OPTIONS),
        "maker_status_messages": notices.MAKER_STATUS_MESSAGES,
    }