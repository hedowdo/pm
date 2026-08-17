import os

import httpx2


OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = "openai/gpt-oss-20b:free"
OPENROUTER_TIMEOUT_SECONDS = 45.0


class OpenRouterError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def request_chat_completion(
    message: str,
    *,
    transport: httpx2.BaseTransport | None = None,
) -> str:
    api_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        raise OpenRouterError(503, "AI service is not configured")

    try:
        with httpx2.Client(
            timeout=OPENROUTER_TIMEOUT_SECONDS,
            transport=transport,
        ) as client:
            response = client.post(
                OPENROUTER_API_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": OPENROUTER_MODEL,
                    "messages": [{"role": "user", "content": message}],
                },
            )
    except httpx2.TimeoutException:
        raise OpenRouterError(504, "AI service timed out") from None
    except httpx2.RequestError:
        raise OpenRouterError(502, "AI service is unavailable") from None

    if response.status_code in (401, 403):
        raise OpenRouterError(502, "AI service authentication failed")
    if response.status_code == 429:
        raise OpenRouterError(503, "AI service is temporarily busy")
    if response.status_code >= 500:
        raise OpenRouterError(502, "AI service is unavailable")
    if response.status_code >= 400:
        raise OpenRouterError(502, "AI service rejected the request")

    try:
        data = response.json()
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError, ValueError):
        raise OpenRouterError(502, "AI service returned an invalid response") from None

    if not isinstance(content, str) or not content.strip():
        raise OpenRouterError(502, "AI service returned an invalid response")
    return content.strip()
