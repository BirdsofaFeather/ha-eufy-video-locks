"""Require privacy-preserving author/committer emails in fetched Git history."""
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[1]
assert (root / '.git').exists(), 'Run this check in a Git checkout, not an extracted source ZIP'
rows = subprocess.check_output(
    ['git', '-C', str(root), 'log', '--all', '--format=%ae%n%ce'], text=True
).splitlines()
unexpected = {email for email in rows if not (
    email.endswith('@users.noreply.github.com') or email == 'noreply@github.com'
)}
# Do not reproduce any exposed address in console output or CI logs.
assert not unexpected, f'{len(unexpected)} non-private commit email(s) found; review metadata privately'
print('Git author/committer email privacy check passed for fetched history.')
