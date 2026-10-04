"""Offline checks of client authentication, redaction and integration syntax."""
import ast
import importlib.util
from pathlib import Path
import unittest

root=Path(__file__).resolve().parents[1]
integration=root/'custom_components/eufy_video_locks'
spec=importlib.util.spec_from_file_location('bridge_auth',integration/'bridge_auth.py')
auth=importlib.util.module_from_spec(spec)
spec.loader.exec_module(auth)

class IntegrationTests(unittest.TestCase):
    def test_private_transport_credentials(self):
        self.assertEqual(auth.bridge_headers('token'),{'Authorization':'Bearer token'})
        self.assertEqual(auth.rtsp_source('bridge',8554,'device /','p@ss:/'), 'rtsp://homeassistant:p%40ss%3A%2F@bridge:8554/device%20%2F')
        self.assertIn('@[::1]:8554/',auth.rtsp_source('::1',8554,'device','pw'))

    def test_python_syntax_and_auth_wiring(self):
        for path in integration.glob('*.py'):
            with self.subTest(file=path.name):ast.parse(path.read_text(),filename=str(path))
        api=(integration/'api.py').read_text()
        self.assertIn('ws_connect(self._url, heartbeat=30, headers=headers)',api)
        self.assertIn('bridge_headers(self._access_token)',api)
        image=(integration/'image.py').read_text()
        self.assertIn('bridge_headers',image)
        init=(integration/'__init__.py').read_text()
        self.assertIn('access_token=entry.data',init)

    def test_diagnostics_redact_pairing_credentials(self):
        tree=ast.parse((integration/'diagnostics.py').read_text())
        keys=next(node.value for node in tree.body if isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='TO_REDACT' for t in node.targets))
        values={n.value for n in keys.elts if isinstance(n,ast.Constant)}
        self.assertTrue({'access_token','rtsp_password','password','adminUserId','shortUserId'}.issubset(values))

if __name__=='__main__':unittest.main()
