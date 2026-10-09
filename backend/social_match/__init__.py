"""Social Match core: scrape, classify, index and search local community posts.

The MCP server (``social_match.mcp_server``) is the front door. Everything here is plain Python
with no network call unless a caller explicitly opts in and supplies a key.
"""

__version__ = "0.2.0"
