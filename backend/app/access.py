"""Defense in depth for private Railway backend. Local loopback development remains unchanged."""
import hmac
import os

from fastapi.responses import JSONResponse


async def access_guard(request, call_next):
    required = bool(os.getenv('RAILWAY_ENVIRONMENT_ID')) or os.getenv('APP_REQUIRE_AUTH') == 'true'
    if required and request.url.path not in ('/health', '/ready'):
        expected = os.getenv('BACKEND_ACCESS_TOKEN', '')
        if len(expected) < 32:
            return JSONResponse({'error': 'Service access is not configured'}, status_code=503)
        supplied = request.headers.get('authorization', '')
        if not hmac.compare_digest(supplied.encode(), f'Bearer {expected}'.encode()):
            return JSONResponse({'error': 'Unauthorized'}, status_code=401)
    return await call_next(request)
