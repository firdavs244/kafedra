"""UserPromptSubmit hook: .claude/rules.md ni har bir promptga qo'shadi.

Xotira sessiya boshida o'qiladi va yigirmanchi xabarga kelib e'tibordan tushadi;
hook esa qoidalarni HAR SAFAR qayta aytadi. Har qanday xatoda jim chiqadi —
buzilgan hook foydalanuvchiga yozishga xalaqit bermasin.
"""

import io
import json
import os
import sys

RULES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rules.md")


def main() -> int:
    try:
        with io.open(RULES, encoding="utf-8") as fh:
            text = fh.read().strip()
    except Exception:
        return 0
    if text:
        print(json.dumps({
            "hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": text},
            "suppressOutput": True,
        }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
