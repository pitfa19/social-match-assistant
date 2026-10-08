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


# ---- Reddit pilot (r/zagreb, r/askcroatia only). Live-unverified, bounded, no auto-posting. ----
from . import reddit  # noqa: E402


@app.exception_handler(reddit.UnknownJob)
async def _unknown_job(_, exc):
    return JSONResponse(status_code=409, content={"error": {
        "code": "unknown_job",
        "message": "Job context is unavailable in this backend process. Check the existing job in Mindcase before starting another billed run."}})


@app.exception_handler(reddit.ParentNotQualified)
async def _not_qualified(_, exc):
    return JSONResponse(status_code=409, content={"error": {
        "code": "parent_not_qualified",
        "message": "Comments are only fetched for posts this backend already returned as qualifying candidates."}})


@app.post("/pilot/reddit/posts")
async def reddit_posts(req: reddit.PostsRequest, settings: Settings = Depends(get_settings),
                       transport=Depends(get_transport)):
    return await reddit.run_posts(req, settings, transport)


@app.get("/pilot/reddit/posts/jobs/{job_id}")
async def reddit_posts_job(job_id: UUID, settings: Settings = Depends(get_settings), transport=Depends(get_transport)):
    """Async path: only jobs started by this process, always with their ORIGINAL filters."""
    return await reddit.posts_job_results(str(job_id), settings, transport)


@app.post("/pilot/reddit/comments")
async def reddit_comments(req: reddit.CommentsRequest, settings: Settings = Depends(get_settings),
                          transport=Depends(get_transport)):
    return await reddit.run_comments(req, settings, transport)


@app.get("/pilot/reddit/comments/jobs/{job_id}")
async def reddit_comments_job(job_id: UUID, settings: Settings = Depends(get_settings), transport=Depends(get_transport)):
    return await reddit.comments_job_results(str(job_id), settings, transport)


# ---- Matching store, retrieval and benchmark (local PostgreSQL, no provider calls) ----
from .matching.routes import router as matching_router  # noqa: E402

app.include_router(matching_router)
