#!/usr/bin/env python3
"""Minimal Vercel test - with error handling"""

def handler(event, context):
    try:
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": '{"ok": true, "message": "hello from vercel"}'
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": f'{{"error": "{str(e)}"}}'
        }
