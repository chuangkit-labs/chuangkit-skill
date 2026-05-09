#!/usr/bin/env python3
import argparse

from _common import dump, pick, request_json, unwrap_response


def build_user_images(file_keys, image_urls):
    user_images = []
    for file_key in file_keys:
        user_images.append({"source": "fileKey", "file_key": file_key})
    for image_url in image_urls:
        user_images.append({"source": "url", "image_url": image_url})
    return user_images


def main():
    parser = argparse.ArgumentParser(description="Send a message to a Chuangkit Agent Canvas session.")
    parser.add_argument("--session-id", help="Target session_id. Omit to let the server create a new session.")
    parser.add_argument("--message", required=True, help="User request to send to the agent.")
    parser.add_argument("--image-file-key", action="append", default=[], help="Uploaded reference file_key. Repeatable.")
    parser.add_argument("--image-url", action="append", default=[], help="Reference image URL. Repeatable.")
    args = parser.parse_args()

    payload = {"message": args.message}
    if args.session_id:
        payload["session_id"] = args.session_id
    user_images = build_user_images(args.image_file_key, args.image_url)
    if user_images:
        payload["user_images"] = user_images

    data = unwrap_response(request_json("/api/agent_skill/messages/send.do", payload))
    dump(pick(data, "request_id", "session_id", "design_id", "design_url", "accepted", "created_session"))


if __name__ == "__main__":
    main()
