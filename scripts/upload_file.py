#!/usr/bin/env python3
import argparse
import mimetypes
import os
import uuid
import urllib.error
import urllib.request

from _common import api_key, dump, endpoint, pick, unwrap_response


def multipart_body(fields, file_field, file_path):
    boundary = f"----chuangkit-agent-skill-{uuid.uuid4().hex}"
    chunks = []
    for name, value in fields.items():
        chunks.append(f"--{boundary}\r\n".encode())
        chunks.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        chunks.append(str(value).encode())
        chunks.append(b"\r\n")

    filename = os.path.basename(file_path)
    content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    chunks.append(f"--{boundary}\r\n".encode())
    chunks.append(
        f'Content-Disposition: form-data; name="{file_field}"; filename="{filename}"\r\n'.encode()
    )
    chunks.append(f"Content-Type: {content_type}\r\n\r\n".encode())
    with open(file_path, "rb") as source:
        chunks.append(source.read())
    chunks.append(b"\r\n")
    chunks.append(f"--{boundary}--\r\n".encode())
    return boundary, b"".join(chunks)


def main():
    parser = argparse.ArgumentParser(description="Upload a reference file to Chuangkit Agent Skill storage.")
    parser.add_argument("--file", required=True, help="Local file path.")
    parser.add_argument("--biz-type", default="agent_skill", help="Storage business type.")
    args = parser.parse_args()

    if not os.path.isfile(args.file):
        raise SystemExit(f"File not found: {args.file}")

    boundary, body = multipart_body({"biz_type": args.biz_type}, "file", args.file)
    request = urllib.request.Request(
        endpoint("/api/agent_skill/assets/upload.do"),
        data=body,
        headers={
            "Authorization": f"Bearer {api_key()}",
            "Accept": "application/json",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=600) as response:
            payload = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"HTTP {exc.code}: {payload}") from exc

    import json

    data = unwrap_response(json.loads(payload) if payload else {})
    dump(pick(data, "file_key", "fileKey", "media_type", "mediaType", "file_size", "fileSize"))


if __name__ == "__main__":
    main()
