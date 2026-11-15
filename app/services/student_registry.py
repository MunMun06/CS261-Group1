import json
import os


class StudentRegistryUnavailable(Exception):
    pass


def fetch_student_faculties(
    student_id: str,
    *,
    fallback_faculty: str,
) -> list[str]:
    default_provider = (
        "unconfigured"
        if os.getenv("APP_ENV", "development").strip().lower() == "production"
        else "mock"
    )
    provider = os.getenv(
        "STUDENT_REGISTRY_PROVIDER", default_provider
    ).strip().lower()
    if provider != "mock":
        raise StudentRegistryUnavailable(
            f"Student registry provider {provider!r} is not configured."
        )

    try:
        mock_data = json.loads(os.getenv("STUDENT_REGISTRY_MOCK_DATA") or "{}")
    except json.JSONDecodeError as exc:
        raise StudentRegistryUnavailable(
            "STUDENT_REGISTRY_MOCK_DATA must be a JSON object."
        ) from exc
    if not isinstance(mock_data, dict):
        raise StudentRegistryUnavailable(
            "STUDENT_REGISTRY_MOCK_DATA must be a JSON object."
        )

    faculties = mock_data.get(student_id, [fallback_faculty])
    if not isinstance(faculties, list) or any(
        not isinstance(faculty, str)
        or not faculty.strip()
        or len(faculty) > 160
        for faculty in faculties
    ):
        raise StudentRegistryUnavailable(
            f"Registry data for student {student_id!r} must be a list of faculty names."
        )
    return list(dict.fromkeys(faculty.strip() for faculty in faculties))
