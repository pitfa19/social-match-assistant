from uuid import UUID

from fastapi import Depends, FastAPI
from fastapi.responses import JSONResponse

from . import mindcase
from .config import Settings, get_settings
from .schemas import FacebookGroupScrape

app = FastAPI(
    title="Social match backend (local only)",
    description="Local development service. No authentication: bind to 127.0.0.1 only.",
    version="0.1.0",
)


def get_transport():
    """Override in tests with httpx.MockTransport."""
    return None


@app.exception_handler(mindcase.ProviderError)
async def _provider_error(_, exc: mindcase.ProviderError):
    return JSONResponse(status_code=exc.status, content={"error": {"code": exc.code, "message": exc.message}})


@app.get("/health")
async def health(settings: Settings = Depends(get_settings)):
    return {"status": "ok", "mindcase_key_configured": settings.api_key is not None}


@app.post("/scrapes/facebook-group")
async def start_scrape(req: FacebookGroupScrape, settings: Settings = Depends(get_settings),
                       transport=Depends(get_transport)):
    return await mindcase.run_group_posts(req, settings, transport)


@app.get("/scrapes/{job_id}/results")
async def scrape_results(job_id: UUID, settings: Settings = Depends(get_settings),
                         transport=Depends(get_transport)):
    return await mindcase.job_results(str(job_id), settings, transport)
