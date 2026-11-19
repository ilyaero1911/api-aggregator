"""Тонкий клиент. В PyPI не публиковался."""


class Client:
    def __init__(self, base_url: str, api_key: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key

    def headers(self) -> dict:
        return {"Authorization": "Bearer " + self.api_key}

    def chat_payload(self, model: str, messages: list, **extra) -> dict:
        body = {"model": model, "messages": messages}
        for key in ("provider", "models", "preset", "temperature"):
            if key in extra:
                body[key] = extra[key]
        return body

    def url(self, path: str) -> str:
        return self.base_url + path
