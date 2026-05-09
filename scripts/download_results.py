#!/usr/bin/env python3
import argparse
import json
import os
from datetime import datetime
from pathlib import Path, PureWindowsPath
import urllib.parse
import urllib.request

from _common import dump, get_any, request_json, unwrap_response


URL_KEYS = (
    "no_water_mark_image_url",
    "noWaterMarkImageUrl",
    "image_url",
    "imageUrl",
    "legal_watermark_image_url",
    "legalWatermarkImageUrl",
)


def collect_result_urls(payload):
    urls = []
    for message in payload.get("messages") or []:
        tasks = get_any(message, "tasks")
        task_list = get_any(tasks, "list") or []
        for item in task_list:
            for key in URL_KEYS:
                url = get_any(item, key)
                if url:
                    urls.append(url)
                    break
    return urls


def extension_for(url):
    path = urllib.parse.urlparse(url).path
    name = os.path.basename(path)
    _, ext = os.path.splitext(name)
    return ext or ".png"


def date_folder_for_payload(payload):
    for message in payload.get("messages") or []:
        create_time = get_any(message, "create_time", "createTime")
        if not create_time:
            continue
        try:
            return datetime.strptime(create_time, "%Y-%m-%d %H:%M:%S").strftime("%Y%m%d")
        except ValueError:
            continue
    return datetime.now().strftime("%Y%m%d")


def request_id_for_payload(payload):
    return get_any(payload, "request_id", "requestId") or "unknown-request"


def default_output_dir(os_name=None, home=None):
    os_name = os_name or os.name
    if os_name == "nt":
        windows_home = home or os.environ.get("USERPROFILE") or str(Path.home())
        return str(PureWindowsPath(windows_home) / "Downloads" / "chuangkit-agent-results")

    unix_home = home or str(Path.home())
    return os.path.join(unix_home, "Downloads", "chuangkit-agent-results")


def build_download_path(output_dir, payload, url, index):
    dated_dir = os.path.join(output_dir, date_folder_for_payload(payload))
    filename = f"{request_id_for_payload(payload)}_{index:02d}{extension_for(url)}"
    return os.path.join(dated_dir, filename)


def download(url, output_dir, payload, index):
    target = build_download_path(output_dir, payload, url, index)
    os.makedirs(os.path.dirname(target), exist_ok=True)
    normalized_url = f"https:{url}" if url.startswith("//") else url
    urllib.request.urlretrieve(normalized_url, target)
    return target


def main():
    parser = argparse.ArgumentParser(description="Download generated images from Chuangkit Agent Skill messages.")
    parser.add_argument("--request-id", help="Query this request_id before downloading.")
    parser.add_argument("--poll-file", help="Read an existing JSON file instead of calling the API.")
    parser.add_argument("--output-dir", help="Download directory. Defaults to the current user's Downloads/chuangkit-agent-results.")
    parser.add_argument("--page-size", type=int, default=50)
    args = parser.parse_args()

    if not args.request_id and not args.poll_file:
        raise SystemExit("Either --request-id or --poll-file is required")

    if args.poll_file:
        with open(args.poll_file, "r", encoding="utf-8") as source:
            payload = json.load(source)
    else:
        payload = unwrap_response(request_json("/api/agent_skill/requests/status.do", {
            "request_id": args.request_id,
            "page_size": args.page_size,
        }))

    output_dir = args.output_dir or default_output_dir()
    downloaded = [download(url, output_dir, payload, index) for index, url in enumerate(collect_result_urls(payload), 1)]
    dump({"count": len(downloaded), "files": downloaded})


if __name__ == "__main__":
    main()
