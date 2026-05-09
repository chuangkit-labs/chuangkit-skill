#!/usr/bin/env python3
import json
import os
import sys
import urllib.error
import urllib.request


API_KEY_ENV = "CHUANGKIT_AGENT_SKILL_API_KEY"
DEFAULT_BASE_URL = "https://gw.chuangkit.com/aigc"


def require_env(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def base_url():
    return DEFAULT_BASE_URL


def api_key():
    return require_env(API_KEY_ENV)


def endpoint(path):
    return f"{base_url()}{path}"


def request_json(path, payload=None, method="POST"):
    data = None
    headers = {
        "Authorization": f"Bearer {api_key()}",
        "Accept": "application/json",
    }
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json; charset=utf-8"

    request = urllib.request.Request(endpoint(path), data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=600) as response:
            body = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"HTTP {exc.code}: {body}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"Request failed: {exc}") from exc

    return json.loads(body) if body else {}


def unwrap_response(response):
    if not isinstance(response, dict):
        return response

    if "body" in response and isinstance(response.get("body"), dict):
        body = response["body"]
        code = body.get("code")
        success = body.get("success")
        if success is False or (code is not None and code not in (0, 200)):
            message = body.get("msg") or body.get("message") or body
            raise SystemExit(f"API error: {message}")
        return body.get("data", body)

    code = response.get("code")
    success = response.get("success")
    if success is False or (code is not None and code not in (0, 200)):
        message = response.get("msg") or response.get("message") or response
        raise SystemExit(f"API error: {message}")
    return response.get("data", response)


def dump(value):
    json.dump(value, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


def get_any(mapping, *keys):
    for key in keys:
        if isinstance(mapping, dict) and key in mapping:
            return mapping[key]
    return None


def pick(mapping, *keys):
    result = {}
    if not isinstance(mapping, dict):
        return result
    for key in keys:
        value = mapping.get(key)
        if value is not None:
            result[key] = value
    return result
