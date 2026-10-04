"""Prevent accidental publication of household data or runtime credentials."""
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
for path in root.rglob('*'):
    if not path.is_file() or any(p in {'.git', '__pycache__', 'node_modules', '.test-sdk'} for p in path.parts):
        continue
    assert not re.search(r'(private.*\.json$|\.pcap|\.dmg$|options\.json$|session.*\.json$)', path.name, re.I), f'Private runtime file: {path.relative_to(root)}'
    try:
        text = path.read_text()
    except UnicodeDecodeError:
        continue
    assert not re.search(r'[/]Users[/]|192[.]168[.]', text), f'Household path/address: {path.relative_to(root)}'
    # Synthetic test serials end in eleven zeroes; real serials must be configured privately.
    serials = re.findall(r'T(?:853[01]|8021)[A-Z0-9]{11}', text)
    assert all(s.endswith('0' * 11) for s in serials), f'Device serial: {path.relative_to(root)}'
manifest = json.loads((root/'custom_components/eufy_video_locks/manifest.json').read_text())
config = (root/'eufy_video_locks/config.yaml').read_text()
assert f'version: "{manifest["version"]}"' in config, 'App and integration versions differ'
assert 'hassio_api: false' in config and 'homeassistant_api: false' in config
assert not re.search(r'^map:|^host_network: true|^privileged:', config, re.M)
print('Static publication guards passed: configured private-file/address/serial patterns absent; versions agree.')
