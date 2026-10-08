"""Serve both Railway IPv4 health checks and IPv6 private traffic."""
import os
import socket

import uvicorn


def main():
    port = int(os.environ.get('PORT', '8000'))
    listener = socket.create_server(
        ('::', port), family=socket.AF_INET6, dualstack_ipv6=True
    )
    config = uvicorn.Config('app.main:app', port=port)
    uvicorn.Server(config).run(sockets=[listener])


if __name__ == '__main__':
    main()
