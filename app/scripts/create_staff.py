"""Creates a court staff account, or sets a new password for one (e.g. the seeded "S").

The password is typed at a hidden prompt, so it never appears on screen or in shell
history. With Docker:

    docker compose exec backend python -m app.scripts.create_staff staff01 --name "ชื่อเจ้าหน้าที่"

Then log in on the "เจ้าหน้าที่สนาม" tab of the login page with that username and password.
"""

import argparse
import getpass
import sys

from app.core.database import get_session_factory
from app.scripts.migrate import migrate_database
from app.services.staff_auth import MIN_PASSWORD_LENGTH, set_staff_password


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("username", help="staff login name, e.g. staff01 or S")
    parser.add_argument("--name", help="name shown in the page header (Thai is fine)")
    args = parser.parse_args(argv)

    password = getpass.getpass(f"New password (at least {MIN_PASSWORD_LENGTH} characters): ")
    if password != getpass.getpass("Type it again: "):
        print("The two passwords do not match; nothing was changed.", file=sys.stderr)
        return 1

    migrate_database()
    with get_session_factory()() as session:
        try:
            user, created = set_staff_password(
                session, args.username, password, name=args.name
            )
        except ValueError as exc:
            print(exc, file=sys.stderr)
            return 1
        session.commit()
        action = "Created staff account" if created else "Set a new password for"
        print(f"{action} {user.student_id!r} ({user.name_th}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
