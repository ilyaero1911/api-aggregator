from pathlib import Path
import re
import sys

subject = Path(sys.argv[1]).read_text().splitlines()[0]
if not re.fullmatch(r'(feat|fix|docs|test|build|ci|chore|refactor|perf|revert)(\([a-z0-9_-]+\))?!?: .+', subject):
    raise SystemExit('Use a Conventional Commit, e.g. feat(api): add model contract')
