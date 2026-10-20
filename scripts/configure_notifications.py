"""Install the push worker with ephemeral management credentials.

Private signing material is stored in Supabase Vault and Edge Function secrets,
never in public config, Git, or terminal output.
"""
import json
import secrets
import subprocess
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def sql_string(value):
    return "'" + value.replace("'", "''") + "'"


def deploy_worker(base, token):
    boundary = "household-" + secrets.token_hex(16)
    metadata = {"entrypoint_path": "index.ts", "name": "household-push", "verify_jwt": False}
    chunks = [
        f'--{boundary}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n'.encode(),
        json.dumps(metadata).encode(), b"\r\n",
    ]
    for filename in ("index.ts", "worker.ts"):
        chunks.extend([
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\nContent-Type: application/typescript\r\n\r\n'.encode(),
            (ROOT / "supabase/functions/household-push" / filename).read_bytes(), b"\r\n",
        ])
    chunks.append(f"--{boundary}--\r\n".encode())
    req = urllib.request.Request(base + "/functions/deploy?slug=household-push", data=b"".join(chunks),
        headers={"Authorization": f"Bearer {token}", "Content-Type": f"multipart/form-data; boundary={boundary}"})
    try:
        with urllib.request.urlopen(req, timeout=180) as response:
            result = json.load(response)
            if result.get("status") != "ACTIVE":
                raise RuntimeError("The push worker did not become active. Rerun configuration.")
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"Push worker deployment returned HTTP {exc.code}. Check the token's Edge Function permissions.") from None


def configure_notifications(base, token, config, request):
    def query(sql):
        return request(base + "/database/query", token, {"query": sql})

    installed = query("SELECT to_regprocedure('public.utilities_push_config()')::text AS fn")
    if not installed or not installed[0].get("fn"):
        query((ROOT / "supabase/migrations/008_notifications.sql").read_text())
        print("Notification storage installed; all household records preserved.")
    query("""CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS supabase_vault;""")
    existing = query("SELECT name,decrypted_secret AS value FROM vault.decrypted_secrets WHERE name IN ('household_vapid_public','household_vapid_private','household_push_sender')")
    values = {row["name"]: row["value"] for row in existing}
    if bool(values.get("household_vapid_public")) != bool(values.get("household_vapid_private")):
        raise RuntimeError("Only half of the existing notification signing key was found. Restore the Vault key pair before continuing.")
    if not values.get("household_vapid_private"):
        keys = json.loads(subprocess.check_output([
            "node", "--input-type=module", "-e",
            "import {createECDH} from 'node:crypto'; const k=createECDH('prime256v1');k.generateKeys();process.stdout.write(JSON.stringify({public:k.getPublicKey().toString('base64url'),private:k.getPrivateKey().toString('base64url')}));"
        ], cwd=ROOT))
        values.update(household_vapid_public=keys["public"], household_vapid_private=keys["private"])
    values.setdefault("household_push_sender", secrets.token_hex(32))
    for name, value in values.items():
        if not any(row["name"] == name for row in existing):
            query(f"SELECT vault.create_secret({sql_string(value)},{sql_string(name)})")
    request(base + "/secrets", token, [
        {"name": "HOUSEHOLD_VAPID_PUBLIC_KEY", "value": values["household_vapid_public"]},
        {"name": "HOUSEHOLD_VAPID_PRIVATE_KEY", "value": values["household_vapid_private"]},
        {"name": "HOUSEHOLD_PUSH_SENDER_SECRET", "value": values["household_push_sender"]},
        {"name": "HOUSEHOLD_VAPID_SUBJECT", "value": "https://mlewkowicz.github.io/household-utilities/"},
    ])
    deploy_worker(base, token)
    health = urllib.request.Request(config["url"] + "/functions/v1/household-push?health=1", data=b"{}",
        headers={"Content-Type": "application/json", "x-household-sender": values["household_push_sender"]})
    try:
        with urllib.request.urlopen(health, timeout=60) as response:
            if not json.load(response).get("ready"):
                raise RuntimeError("The notification worker did not pass its readiness check.")
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"Push worker readiness check returned HTTP {exc.code}. Rerun configuration; existing records are safe.") from None
    # The health check above never claims work or sends notifications.
    schedule = (ROOT / "supabase/setup_notifications.sql").read_text()
    query(schedule.replace("{{PROJECT_URL}}", sql_string(config["url"])).replace("{{PUBLIC_KEY}}", sql_string(values["household_vapid_public"])))
    print("Phone notifications configured for iPhone and Android. Signing keys preserved in Supabase.")
    print("Each roommate can now tap the site's bell to opt in. No historical alerts were sent by setup.")
