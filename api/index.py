# Minimal ASGI app for testing
from fastapi import FastAPI
from fastapi.responses import JSONResponse

app = FastAPI()

@app.get("/health")
def health():
    return JSONResponse({"ok": True, "message": "hello"})

@app.get("/")
def root():
    return JSONResponse({"ok": True, "message": "ebook-to-audiobook API"})
