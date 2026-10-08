"""Production migration/seed entry point. No provider requests or local cluster creation."""
import os

from .matching.db import connect, migrate
from .matching.sources import seed_sources


def main():
    if not (os.getenv('MATCHING_DATABASE_URL') or os.getenv('DATABASE_URL')):
        raise RuntimeError('A managed database URL is required')
    if len(os.getenv('BACKEND_ACCESS_TOKEN', '')) < 32:
        raise RuntimeError('BACKEND_ACCESS_TOKEN must contain at least 32 characters')
    with connect() as conn:
        migrate(conn)
        count = seed_sources(conn)
    print(f'Database schema ready. {count} source registry entries checked. No content collected.')


if __name__ == '__main__':
    main()
