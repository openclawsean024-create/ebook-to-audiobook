#!/usr/bin/env python3
"""Minimal Vercel test"""

def handler(event, context):
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": '{"ok": true, "message": "hello from vercel"}'
    }
