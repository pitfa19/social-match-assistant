"""Configure the explicitly created Railway deployment without printing secret values.
Run with backend/.venv/bin/python deployment/configure_railway.py.
Uses existing CLI login. Never reads Railway credential files or performs scraping.
"""
import json
import os
from pathlib import Path
import secrets
import subprocess

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
PROJECT = '4fc7dda5-675a-4f55-b2d3-f5eae9eb5f95'
ENVIRONMENT = '41eb4b92-3b03-48ef-8dcd-8310cd5abdf1'
SERVICES = {'backend': '6ab02f98-e3e0-4b82-82bb-0edfe6f76a87', 'frontend': '1ae73515-24a7-4b48-adfb-48bbd48fd6bb'}


def command(args, value=None):
    result = subprocess.run(['railway', *args], input=value, capture_output=True, text=True, cwd=ROOT)
    if result.returncode:
        # Secret-bearing CLI invocations must not echo values through errors.
        raise RuntimeError(f'Railway {args[0]} failed (exit {result.returncode})')
    return result.stdout


def main():
    path = ROOT / '.env.railway'
    if not path.exists():
        with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as stream:
            stream.write(f'SITE_ACCESS_USER=owner\nSITE_ACCESS_PASSWORD={secrets.token_urlsafe(30)}\nBACKEND_ACCESS_TOKEN={secrets.token_urlsafe(40)}\n')
    config = dotenv_values(path)
    frontend = {**dotenv_values(ROOT / 'frontend' / '.env'), **dotenv_values(ROOT / 'frontend' / '.env.local')}
    backend = dotenv_values(ROOT / 'backend' / '.env')
    values = {
        'backend': {'PORT': '8000', 'APP_REQUIRE_AUTH': 'true', 'DATABASE_URL': '${{Postgres.DATABASE_URL}}',
                    'BACKEND_ACCESS_TOKEN': config['BACKEND_ACCESS_TOKEN']},
        'frontend': {'PORT': '3000', 'APP_REQUIRE_AUTH': 'true', 'BACKEND_URL': 'http://backend.railway.internal:8000',
                     'PUBLIC_PREVIEW_UNTIL': '2026-10-08T22:00:00Z',
                     'BACKEND_ACCESS_TOKEN': config['BACKEND_ACCESS_TOKEN'], 'SITE_ACCESS_USER': config['SITE_ACCESS_USER'],
                     'SITE_ACCESS_PASSWORD': config['SITE_ACCESS_PASSWORD']},
    }
    for key in ['OPENAI_API_KEY', 'ELEVENLABS_API_KEY', 'OPENAI_MODEL', 'OPENAI_DECISIONS_MODEL']:
        value = frontend.get(key) or backend.get(key) or os.getenv(key)
        if value:
            values['frontend'][key] = value
    for key in ['MINDCASE_API_KEY', 'OPENAI_API_KEY', 'OPENAI_DECISIONS_MODEL']:
        value = backend.get(key) or frontend.get(key) or os.getenv(key)
        if value:
            values['backend'][key] = value
    mutation = 'mutation($serviceId:String!,$environmentId:String!,$input:ServiceInstanceUpdateInput!){serviceInstanceUpdate(serviceId:$serviceId,environmentId:$environmentId,input:$input)}'
    for service, service_id in SERVICES.items():
        args = {'serviceId': service_id, 'environmentId': ENVIRONMENT,
                'input': {'dockerfilePath': f'{service}/Dockerfile', 'rootDirectory': '/',
                          'healthcheckPath': '/ready' if service == 'backend' else '/api/health',
                          'healthcheckTimeout': 180, 'restartPolicyType': 'ON_FAILURE', 'restartPolicyMaxRetries': 3,
                          'numReplicas': 1, 'sleepApplication': False}}
        command(['api', mutation, '--variables', json.dumps(args), '--compact'])
        for key, value in values[service].items():
            command(['variable', 'set', key, '--stdin', '--skip-deploys', '--service', service_id,
                     '--project', PROJECT, '--environment', ENVIRONMENT], str(value))
        print(service + ': configured keys ' + ', '.join(values[service]))
    print('Preview credentials saved locally in .env.railway (0600, gitignored). No secret values printed.')


if __name__ == '__main__':
    main()
