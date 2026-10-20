import io
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import configure_notifications as setup
import configure


class NotificationSetupTests(unittest.TestCase):
    def test_successful_empty_management_response_is_not_a_setup_error(self):
        with patch.object(configure.urllib.request, "urlopen", return_value=io.BytesIO(b"")):
            self.assertIsNone(configure.request("https://api.example/secrets", "private-token", []))

    def test_repeat_setup_keeps_existing_signing_keys_and_enables_only_after_health(self):
        calls = []
        values = {"household_vapid_public": "existing-public", "household_vapid_private": "existing-private", "household_push_sender": "existing-sender"}
        def request(url, token, data=None):
            calls.append((url, data))
            query = data.get("query", "") if isinstance(data, dict) else ""
            if "to_regprocedure" in query:
                return [{"fn": "utilities_push_config()"}]
            if "SELECT name,decrypted_secret" in query:
                return [{"name": k, "value": v} for k, v in values.items()]
            return []
        def health(req, **kwargs):
            self.assertTrue(req.full_url.endswith("?health=1"))
            self.assertFalse(any("UPDATE ledger_private.push_config" in str(data) for _, data in calls))
            return io.BytesIO(b'{"ready":true}')
        with patch.object(setup, "deploy_worker"), patch.object(setup.urllib.request, "urlopen", side_effect=health), patch.object(setup.subprocess, "check_output") as generate:
            setup.configure_notifications("https://api.example/project", "private-token", {"url": "https://example.supabase.co"}, request)
            generate.assert_not_called()
        sent = next(data for url, data in calls if url.endswith("/secrets"))
        self.assertEqual(next(x["value"] for x in sent if x["name"] == "HOUSEHOLD_VAPID_PRIVATE_KEY"), "existing-private")
        self.assertNotIn("vault.create_secret", str(calls))
        self.assertIn("enabled=true", calls[-1][1]["query"])
        self.assertNotIn("existing-private", calls[-1][1]["query"])

    def test_deploy_is_authenticated_multipart_with_private_auth_enforced_by_worker(self):
        def receive(req, **kwargs):
            self.assertEqual(req.get_header("Authorization"), "Bearer private-token")
            self.assertIn("multipart/form-data", req.get_header("Content-type"))
            self.assertIn(b'"verify_jwt": false', req.data)
            self.assertIn(b'filename="worker.ts"', req.data)
            self.assertIn(b'x-household-sender', req.data)
            self.assertNotIn(b'private-token', req.data)
            return io.BytesIO(json.dumps({"status": "ACTIVE"}).encode())
        with patch.object(setup.urllib.request, "urlopen", side_effect=receive):
            setup.deploy_worker("https://api.example/project", "private-token")

    def test_partial_existing_key_pair_fails_without_replacing_it(self):
        def request(url, token, data=None):
            query = data.get("query", "")
            if "to_regprocedure" in query:
                return [{"fn": "exists"}]
            if "SELECT name,decrypted_secret" in query:
                return [{"name": "household_vapid_public", "value": "public-only"}]
            return []
        with self.assertRaisesRegex(RuntimeError, "half"):
            setup.configure_notifications("https://api.example/project", "private-token", {}, request)
