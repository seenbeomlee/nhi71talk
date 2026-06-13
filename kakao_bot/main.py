from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from chatbot import handle_webhook

app = FastAPI(title="일정 챗봇")


@app.api_route("/health", methods=["GET", "HEAD"])
async def health():
    return {"status": "ok"}


@app.post("/webhook/kakao")
async def kakao_webhook(request: Request):
    body = await request.json()
    response = handle_webhook(body)
    return JSONResponse(content=response)
