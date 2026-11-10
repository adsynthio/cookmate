"""Calls into the Kitchen Brain as the signed-in user (VOICE-07).

The agent never writes the database directly with a service key: every call carries the user's JWT
(passed in the room/participant metadata by the voice-token function), so row-level security applies
to voice exactly as it does to touch.
"""

from __future__ import annotations

from typing import Any

import httpx

from .config import Settings


class KitchenBrain:
    def __init__(self, settings: Settings, user_jwt: str, client: httpx.AsyncClient | None = None):
        self._base = settings.supabase_url.rstrip("/")
        self._headers = {
            "apikey": settings.supabase_anon_key,
            "Authorization": f"Bearer {user_jwt}",
            "Content-Type": "application/json",
        }
        self._client = client or httpx.AsyncClient(timeout=5.0)

    async def rpc(self, name: str, args: dict[str, Any]) -> Any:
        r = await self._client.post(f"{self._base}/rest/v1/rpc/{name}", json=args, headers=self._headers)
        r.raise_for_status()
        return r.json() if r.content else None

    async def function(self, name: str, body: dict[str, Any]) -> Any:
        r = await self._client.post(f"{self._base}/functions/v1/{name}", json=body, headers=self._headers)
        r.raise_for_status()
        return r.json()

    async def aclose(self) -> None:
        await self._client.aclose()
